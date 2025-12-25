"use client"

import React, { useState } from "react";
import '../styles/styles.css'
import { backendurl } from "../contsants/constants";

function SubmitJob({setResults}) {
  const [jobDescription, setJobDescription] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");
  const [preferredSkills, setPreferredSkills] = useState("");
  const [minExperience, setMinExperience] = useState("");
  const [locations, setLocations] = useState("");
  const [maxSalary, setMaxSalary] = useState("");
  

  const handleSubmit = async () => {
    const payload = {
      jobDescription: {
        rawText: jobDescription,
        requiredSkills: requiredSkills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        preferredSkills: preferredSkills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        minExperience: Number(minExperience)
      },
      filters: {
        minExperience: Number(minExperience),
        locations: locations
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
        salaryRange: {
          max: maxSalary ? Number(maxSalary) : null
        }
      },
      
      candidates: []
    };

    const res = await fetch("/api/rank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    setResults(data.results || []);

    console.log(data);
    
  };

  return (
    <div className="mainform">
      <h1>Submit Job Description</h1>

      <label htmlFor="desc">Job Description</label>
      <textarea
        placeholder="Paste Job Description here..."
        name="desc"
        value={jobDescription}
        onChange={(e) => setJobDescription(e.target.value)}
        rows={6}
        style={{ width: "100%" }}
      />

      <label>Required Skills (comma separated)</label>
      <input
        type="text"
        value={requiredSkills}
        onChange={(e) => setRequiredSkills(e.target.value)}
      />

      <label>Preferred Skills (comma separated)</label>
      <input
        type="text"
        value={preferredSkills}
        onChange={(e) => setPreferredSkills(e.target.value)}
      />

      <label>Minimum Experience (years)</label>
      <input
        type="number"
        value={minExperience}
        onChange={(e) => setMinExperience(e.target.value)}
      />

      <label>Locations (comma separated)</label>
      <input
        type="text"
        value={locations}
        onChange={(e) => setLocations(e.target.value)}
      />

      <label>Max Salary (₹ per annum)</label>
      <input
        type="number"
        value={maxSalary}
        onChange={(e) => setMaxSalary(e.target.value)}
      />

      <button onClick={handleSubmit}>Rank Candidates</button>

 
    </div>
  );
}

export default SubmitJob;
