"use client"

import Image from "next/image";
import styles from "./page.module.css";
import SubmitJob from "./components/SubmitJob";
import Display from "./components/Display";
import { useState } from "react";
import '../app/styles/styles.css'

export default function Home() {

  const [results, setResults] = useState([]);

  return (
    <div className="main">
      
      <SubmitJob setResults={setResults}/>
      <Display results={results}/>
    </div>
  );
}
