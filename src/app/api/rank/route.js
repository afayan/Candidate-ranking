import { NextResponse } from "next/server";
import { candidates } from "@/app/data/candidates";

const STOPWORDS = new Set([
  "and", "or", "the", "a", "an", "to", "of", "in", "on", "with", "for", "using",
  "experience", "developer", "engineer", "building", "designing", "scalable",
  "strong", "focus", "focused", "hands", "on", "based", "systems", "apps", "app",
]);

function norm(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/[\.\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonSkill(skill = "") {
  const s = norm(skill);

  // Small alias map for common variants in your dataset
  const aliases = {
    "node js": "nodejs",
    "node": "nodejs",
    "react js": "react",
    "next js": "nextjs",
    "tailwind": "tailwind css",
    "rest api": "rest apis",
    "rest": "rest apis",
    "postgres": "postgresql",
    "postgre": "postgresql",
    "js": "javascript",
  };

  return aliases[s] || s;
}

function uniqueCanonicalSkills(skills = []) {
  return Array.from(new Set(skills.map(canonSkill)));
}

function tokenize(text = "") {
  return norm(text)
    .split(" ")
    .filter((t) => t && t.length > 2 && !STOPWORDS.has(t));
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function jaccard(aTokens, bTokens) {
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  if (A.size === 0 || B.size === 0) return 0;

  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;

  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export async function POST(request) {
  try {
    const { jobDescription, filters } = await request.json();

    /* ---------------- HARD FILTERING ---------------- */

    const filtered = candidates.filter((candidate) => {
      if (filters?.minExperience && candidate.experience < filters.minExperience) {
        return false;
      }

      if (filters?.locations?.length && !filters.locations.includes(candidate.location)) {
        return false;
      }

      if (
        filters?.salaryRange?.max &&
        candidate.salaryExpectation &&
        candidate.salaryExpectation > filters.salaryRange.max
      ) {
        return false;
      }

      return true;
    });

    /* ---------------- SCORING (ELIGIBLE) ---------------- */

    const scoredResults = filtered.map((candidate) => {
      const requiredRaw = jobDescription?.requiredSkills || [];
      const preferredRaw = jobDescription?.preferredSkills || [];

      const required = uniqueCanonicalSkills(requiredRaw);
      const preferred = uniqueCanonicalSkills(preferredRaw);

      const candSkills = uniqueCanonicalSkills(candidate.skills || []);
      const candSkillSet = new Set(candSkills);

      // Exact canonical matches
      const matchedRequired = required.filter((s) => candSkillSet.has(s));
      const matchedPreferred = preferred.filter((s) => candSkillSet.has(s));

      // Soft match: substring fallback (ex: "amazon web services" vs "aws" if you later add it)
      // Only used to improve match lists slightly, without inflating required coverage too much.
      const softMatch = (skill) => {
        const k = canonSkill(skill);
        for (const cs of candSkills) {
          if (cs === k) return true;
          if (cs.includes(k) || k.includes(cs)) return true;
        }
        return false;
      };

      const missingRequired = required.filter((s) => !softMatch(s));

      const requiredCoverage =
        required.length > 0 ? matchedRequired.length / required.length : 1;

      const preferredCoverage =
        preferred.length > 0 ? matchedPreferred.length / preferred.length : 0;

      // Experience score: meets min => 1, plus small bonus for extra years (up to +0.15)
      const minExp = jobDescription?.minExperience;
      let experienceScore = 1;
      if (minExp) {
        const ratio = candidate.experience / minExp;
        const base = clamp01(ratio);
        const bonus = candidate.experience > minExp
          ? Math.min((candidate.experience - minExp) * 0.05, 0.15)
          : 0;
        experienceScore = clamp01(base + bonus);
      }

      // Text relevance: build job text from skills + any provided text fields
      const jobText = [
        ...(jobDescription?.title ? [jobDescription.title] : []),
        ...(jobDescription?.summary ? [jobDescription.summary] : []),
        ...(jobDescription?.description ? [jobDescription.description] : []),
        ...requiredRaw,
        ...preferredRaw,
      ].join(" ");

      const semanticScore = clamp01(
        jaccard(tokenize(jobText), tokenize(candidate.resumeText || ""))
      );

      // Missing required penalty: stronger as coverage drops
      const missingPenalty =
        required.length > 0 ? (missingRequired.length / required.length) : 0;

      // Nonlinear weighting so required matters most
      const requiredComponent = Math.pow(requiredCoverage, 1.7);   // pushes top matches up
      const preferredComponent = Math.pow(preferredCoverage, 1.2);

      let finalScore =
        requiredComponent * 0.58 +
        preferredComponent * 0.17 +
        experienceScore * 0.18 +
        semanticScore * 0.07;

      // Penalize missing required (up to 40% reduction)
      finalScore *= (1 - Math.min(missingPenalty * 0.4, 0.4));

      finalScore = clamp01(finalScore);

      return {
        candidateId: candidate.id,
        name: candidate.name,
        score: Number(finalScore.toFixed(2)),
        matchedSkills: Array.from(new Set([...matchedRequired, ...matchedPreferred])),
        missingSkills: missingRequired,
        experienceFit: minExp ? candidate.experience >= minExp : true,
        filteredOut: false,
        // internal fields for tie-break only (not returned)
        _tie: {
          reqMatches: matchedRequired.length,
          exp: candidate.experience,
          salary: candidate.salaryExpectation ?? Number.POSITIVE_INFINITY,
        },
      };
    });

    /* ---------------- INELIGIBLE CANDIDATES ---------------- */

    const ineligible = candidates
      .filter((candidate) => !filtered.some((f) => f.id === candidate.id))
      .map((candidate) => ({
        candidateId: candidate.id,
        name: candidate.name,
        score: 0,
        matchedSkills: [],
        missingSkills: [],
        experienceFit: false,
        filteredOut: true,
      }));

    /* ---------------- MERGE + RANK ---------------- */

    const results = [...scoredResults, ...ineligible]
      .sort((a, b) => {
        // primary: score
        if (b.score !== a.score) return b.score - a.score;

        // tie-breaks for eligible candidates only
        const at = a._tie || { reqMatches: 0, exp: 0, salary: Number.POSITIVE_INFINITY };
        const bt = b._tie || { reqMatches: 0, exp: 0, salary: Number.POSITIVE_INFINITY };

        if (bt.reqMatches !== at.reqMatches) return bt.reqMatches - at.reqMatches;
        if (bt.exp !== at.exp) return bt.exp - at.exp;
        return at.salary - bt.salary; // cheaper first
      })
      .map(({ _tie, ...rest }) => rest); // remove internal field

    return NextResponse.json({
      totalCandidates: candidates.length,
      eligibleCandidates: filtered.length,
      ineligibleCandidates: ineligible.length,
      results,
    });
  } catch (error) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
