import { NextResponse } from "next/server";
import { candidates } from "@/app/data/candidates";

export async function POST(request) {
  try {
    const { jobDescription, filters } = await request.json();

    /* ---------------- HARD FILTERING ---------------- */

    const filtered = candidates.filter((candidate) => {
      if (
        filters?.minExperience &&
        candidate.experience < filters.minExperience
      ) {
        return false;
      }

      if (
        filters?.locations?.length &&
        !filters.locations.includes(candidate.location)
      ) {
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
      const required = jobDescription.requiredSkills || [];
      const preferred = jobDescription.preferredSkills || [];

      const matchedRequired = required.filter((s) =>
        candidate.skills.includes(s)
      );
      const matchedPreferred = preferred.filter((s) =>
        candidate.skills.includes(s)
      );

      const missingRequired = required.filter(
        (s) => !candidate.skills.includes(s)
      );

      const requiredScore =
        required.length > 0
          ? matchedRequired.length / required.length
          : 1;

      const preferredScore =
        preferred.length > 0
          ? matchedPreferred.length / preferred.length
          : 0;

      const experienceScore = jobDescription.minExperience
        ? Math.min(
            candidate.experience / jobDescription.minExperience,
            1
          )
        : 1;

      const finalScore =
        requiredScore * 0.5 +
        preferredScore * 0.2 +
        experienceScore * 0.3;

      return {
        candidateId: candidate.id,
        name: candidate.name,
        score: Number(finalScore.toFixed(2)),
        matchedSkills: [...matchedRequired, ...matchedPreferred],
        missingSkills: missingRequired,
        experienceFit:
          candidate.experience >= jobDescription.minExperience,
        filteredOut: false
      };
    });

    /* ---------------- INELIGIBLE CANDIDATES ---------------- */

    const ineligible = candidates
      .filter(
        (candidate) =>
          !filtered.some((f) => f.id === candidate.id)
      )
      .map((candidate) => ({
        candidateId: candidate.id,
        name: candidate.name,
        score: 0,
        matchedSkills: [],
        missingSkills: [],
        experienceFit: false,
        filteredOut: true
      }));

    /* ---------------- MERGE + RANK ---------------- */

    const results = [...scoredResults, ...ineligible].sort(
      (a, b) => b.score - a.score
    );

    return NextResponse.json({
      totalCandidates: candidates.length,
      eligibleCandidates: filtered.length,
      ineligibleCandidates: ineligible.length,
      results
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
