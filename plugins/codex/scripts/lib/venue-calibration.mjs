const VENUES = {
  neurips: {
    name: "NeurIPS",
    acceptanceBar: "Top ~25% of submissions. Requires clear novelty, strong experimental validation, and significance to the ML community.",
    reviewCriteria: "Soundness (1-4), Presentation (1-4), Contribution (1-4), Overall (1-10), Confidence (1-5)",
    promptSection: [
      "You are calibrating this review to NeurIPS standards.",
      "NeurIPS accepts roughly 25% of submissions. The bar is high.",
      "Scoring guide:",
      "- Overall 8-10: Strong accept. Significant contribution, strong experiments, clear writing.",
      "- Overall 6-7: Weak accept. Solid work with minor issues.",
      "- Overall 5: Borderline. Interesting but with notable gaps.",
      "- Overall 3-4: Weak reject. Significant issues in methodology or contribution.",
      "- Overall 1-2: Strong reject. Fundamental flaws.",
      "Key NeurIPS criteria: originality, quality, clarity, significance.",
      "Papers must advance understanding, not just achieve state-of-the-art numbers.",
      "Reproducibility is strongly valued. Code and data availability matter."
    ].join("\n")
  },
  icml: {
    name: "ICML",
    acceptanceBar: "Top ~25% of submissions. Emphasizes technical rigor and theoretical contributions alongside empirical work.",
    reviewCriteria: "Soundness (1-4), Presentation (1-4), Contribution (1-4), Overall (1-10), Confidence (1-5)",
    promptSection: [
      "You are calibrating this review to ICML standards.",
      "ICML accepts roughly 25% of submissions.",
      "ICML values theoretical rigor alongside empirical results.",
      "Claims and Evidence: Are claims well-supported? Are experiments comprehensive?",
      "Relation to Prior Works: Is the positioning accurate and complete?",
      "Negative results and careful ablations are valued.",
      "Reproducibility: Are enough details provided to reproduce results?"
    ].join("\n")
  },
  iclr: {
    name: "ICLR",
    acceptanceBar: "Top ~30% of submissions. Open review process. Values representation learning, deep learning theory, and practical impact.",
    reviewCriteria: "Soundness (1-4), Presentation (1-4), Contribution (1-4), Overall (1,3,5,6,8,10), Confidence (1-5)",
    promptSection: [
      "You are calibrating this review to ICLR standards.",
      "ICLR accepts roughly 30% of submissions via open peer review.",
      "ICLR values clear contributions to representation learning and deep learning.",
      "Scoring guide (discrete scale: 1, 3, 5, 6, 8, 10):",
      "- 8-10: Accept. Clear contribution with strong support.",
      "- 6: Marginally above acceptance threshold.",
      "- 5: Marginally below acceptance threshold.",
      "- 1-3: Reject. Significant issues.",
      "Open review means transparency. Be specific and constructive."
    ].join("\n")
  },
  acl: {
    name: "ACL",
    acceptanceBar: "Top ~20-25% of submissions. NLP-focused. Values linguistic insight, not just benchmark numbers.",
    reviewCriteria: "Soundness (1-5), Excitement (1-5), Overall (1-5), Reproducibility (1-5), Confidence (1-5)",
    promptSection: [
      "You are calibrating this review to ACL Rolling Review standards.",
      "ACL accepts roughly 20-25% of submissions.",
      "Overall Assessment scale: 5=Award-worthy, 4=Conference paper, 3=Findings paper, 2=Needs revisions, 1=Should redo.",
      "ACL values linguistic insight and careful analysis over pure benchmark chasing.",
      "Excitement score: How transformational is this for the field?",
      "Reproducibility assessment is mandatory."
    ].join("\n")
  },
  nature: {
    name: "Nature",
    acceptanceBar: "Top ~8% of submissions. Requires broad significance, exceptional novelty, and rigorous methodology.",
    reviewCriteria: "Significance, Novelty, Methodology, Presentation, Reproducibility",
    promptSection: [
      "You are calibrating this review to Nature standards.",
      "Nature accepts roughly 8% of submissions. The bar is exceptionally high.",
      "Three critical questions:",
      "1. Is this a substantial advance in understanding? (not incremental)",
      "2. Will this be of interest to scientists outside the immediate field?",
      "3. Are the claims convincingly supported by the data?",
      "Nature requires: clear methodology, statistical rigor, data availability.",
      "Ethics and reproducibility statements are mandatory.",
      "Use accept only for truly exceptional work with broad impact."
    ].join("\n")
  },
  workshop: {
    name: "Workshop",
    acceptanceBar: "Top ~50-70% of submissions. Values interesting ideas and preliminary results. Lower bar for methodology completeness.",
    reviewCriteria: "Interest, Novelty, Soundness, Presentation",
    promptSection: [
      "You are calibrating this review to workshop paper standards.",
      "Workshop acceptance rates are typically 50-70%.",
      "The bar is lower than main conference proceedings.",
      "Value interesting ideas and promising directions even with incomplete experiments.",
      "Focus on: Is the idea interesting? Is the direction promising? Is it well-presented?",
      "Minor methodology gaps are acceptable if the core idea is sound.",
      "Use reject only for papers with fundamental flaws or off-topic submissions."
    ].join("\n")
  }
};

export const SUPPORTED_VENUES = Object.keys(VENUES);

export function getVenueCalibration(venue) {
  if (!venue || typeof venue !== "string") {
    return null;
  }
  return VENUES[venue.toLowerCase().trim()] ?? null;
}
