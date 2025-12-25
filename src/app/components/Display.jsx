import React from 'react'
import '../styles/results.css'

function Display({results}) {
  return (
    <div className='results'>
     { results && results.length > 0 && (
        <div >
          <h2>Ranked Candidates</h2>
          {results.map((c, index) => (
            <div key={c.candidateId}>
              <h3>
                #{index + 1} {c.name} — Score: {c.score}
              </h3>
              <p>Matched Skills: {c.matchedSkills.join(", ")}</p>
              <p>Missing Skills: {c.missingSkills.join(", ")}</p>
              <p>
                Experience Fit: {c.experienceFit ? "Yes" : "No"}
              </p>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

export default Display