const AGENCIES = {
  horizon: {
    name: "Horizon Europe",
    region: "EU",
    acceptanceRate: "~15%",
    scoringSystem: "0-5 scale with half marks; threshold 3/5 per criterion, 10/15 total",
    keyCriteria: ["Excellence", "Impact", "Quality & Efficiency of Implementation"],
    promptSection: [
      "You are calibrating this review to Horizon Europe standards.",
      "Horizon Europe accepts roughly 15% of proposals. The bar is high.",
      "Scoring is 0-5 per criterion (half marks allowed). Threshold: 3/5 per criterion and 10/15 total.",
      "Three criteria are scored: Excellence, Impact, Quality & Efficiency of Implementation.",
      "For Innovation Actions, Impact is weighted x1.5 in the final score.",
      "Score 5: Excellent — proposal addresses all aspects with convincing detail.",
      "Score 4: Very Good — small weaknesses present but overall sound.",
      "Score 3 (threshold): Good — meets expectations but notable gaps remain.",
      "Score 2: Fair — significant weaknesses; unlikely to succeed without major revision.",
      "Score 1: Poor — proposal fails to address key aspects; fundamental flaws.",
      "Excellence covers novelty, scientific/technological objectives, and soundness of approach.",
      "Impact must show short- and long-term benefits and a credible dissemination/exploitation plan.",
      "Implementation must demonstrate a realistic work plan, risks, and team competence.",
      "Only proposals that clearly exceed the threshold on all three criteria should be recommended for funding."
    ].join("\n")
  },
  erc: {
    name: "European Research Council",
    region: "EU",
    acceptanceRate: "~14%",
    scoringSystem: "A/B/C categories; sole criterion is Scientific Excellence",
    keyCriteria: ["Scientific Excellence (groundbreaking nature, high-risk/high-gain, PI track record)"],
    promptSection: [
      "You are calibrating this review to ERC standards.",
      "ERC accepts roughly 14% of proposals across Starting, Consolidator, Advanced, and Synergy grants.",
      "The sole criterion is Scientific Excellence — socioeconomic impact is explicitly not evaluated.",
      "Category A: Excellent — proposal should be funded (top tier).",
      "Category B: Good — proposal has merit but falls below the funding threshold.",
      "Category C: Not competitive — significant scientific weaknesses.",
      "Sub-criteria under Excellence: groundbreaking nature of the proposed research,",
      "  the high-risk/high-gain profile, and the PI's track record and capacity to deliver.",
      "Starting Grant (up to 1.5M EUR/5yr): focus on PI independence and early career trajectory.",
      "Consolidator Grant (up to 2M EUR/5yr): focus on consolidating research team and programme.",
      "Advanced Grant (up to 2.5M EUR/5yr): focus on established leader with exceptional vision.",
      "Synergy Grant (up to 10M EUR/6yr): focus on complementarity and synergy between PIs.",
      "Apply an A only when the proposal represents a genuinely transformative scientific idea.",
      "Incremental or low-risk proposals should receive B or C regardless of technical quality."
    ].join("\n")
  },
  ukri: {
    name: "UK Research and Innovation",
    region: "UK",
    acceptanceRate: "~25-30%",
    scoringSystem: "Qualitative assessment (no published numerical scale)",
    keyCriteria: ["Vision", "Approach", "Team Capability", "Resources", "Ethics"],
    promptSection: [
      "You are calibrating this review to UKRI standards.",
      "UKRI accepts roughly 25-30% of proposals, varying by council and scheme.",
      "Assessment is qualitative; reviewers use Outstanding/Excellent/Good/Poor narrative grades.",
      "Five assessment areas: Vision, Approach, Team Capability, Resources, Ethics.",
      "Vision: Is the research question ambitious, timely, and clearly articulated?",
      "Approach: Is the methodology rigorous, feasible, and appropriate to the aims?",
      "Team Capability: Does the team have the skills, track record, and capacity to deliver?",
      "Resources: Is the budget justified and does it represent value for money?",
      "Ethics: Are ethical, safety, and IP issues identified and appropriately addressed?",
      "UKRI funds 80% of full economic costs (fEC); resource justification must reflect this.",
      "Pathways to Impact sections should be evaluated for credibility and breadth.",
      "Use Outstanding only for proposals that are exceptional on every dimension.",
      "Good is the modal grade; Poor indicates a fundamental deficiency in that area."
    ].join("\n")
  },
  dfg: {
    name: "Deutsche Forschungsgemeinschaft",
    region: "DE",
    acceptanceRate: "~30%",
    scoringSystem: "Narrative assessment + 5-point scale for collaborative programs (5=excellent, 1=unsatisfactory)",
    keyCriteria: ["Quality and originality of the research", "Applicant qualifications", "Work environment"],
    promptSection: [
      "You are calibrating this review to DFG standards.",
      "DFG accepts roughly 30% of proposals; rates vary by programme.",
      "Individual grants use narrative assessments; collaborative programmes add a 5-point scale.",
      "5-point scale: 5=Excellent, 4=Very Good, 3=Good, 2=Satisfactory, 1=Unsatisfactory.",
      "Three core criteria: quality and originality of the research, applicant qualifications, work environment.",
      "Quality and originality: Is the proposal scientifically rigorous and genuinely new?",
      "Applicant qualifications: Does the publication record demonstrate competence and independence?",
      "Work environment: Are infrastructure, collaborations, and supervision arrangements adequate?",
      "DFG explicitly excludes socioeconomic impact from its evaluation — do not penalise proposals lacking it.",
      "Purely scientific merit is the determining factor; application to societal problems is not required.",
      "For Emmy Noether and Heisenberg programmes, assess the applicant's trajectory toward independence.",
      "Collaborative Research Centres (SFB) require assessment of the centre's coherence and added value.",
      "Avoid grade inflation: a score of 5 should be reserved for proposals of outstanding scientific vision."
    ].join("\n")
  },
  anr: {
    name: "Agence Nationale de la Recherche",
    region: "FR",
    acceptanceRate: "~24%",
    scoringSystem: "Ranked lists (no numerical scores); two-stage evaluation",
    keyCriteria: ["Scientific aims (determining criterion)", "Organisation and conduct", "Impact"],
    promptSection: [
      "You are calibrating this review to ANR standards.",
      "ANR accepts roughly 24% of proposals through a two-stage evaluation process.",
      "No numerical scores are assigned; panels produce ranked lists with fund/reject decisions.",
      "Three criteria: Scientific aims (determining), Organisation and conduct, Impact.",
      "Scientific aims is the determining criterion — weak science cannot be compensated by impact.",
      "Organisation: Is the consortium well-structured, are tasks clearly distributed, is the timeline realistic?",
      "Impact: Are scientific, economic, and societal impacts credibly described and proportionate?",
      "Stage 1 evaluates pre-proposals; only top-ranked projects are invited to Stage 2 full proposals.",
      "JCJC (Jeunes Chercheurs): assess the PI's independence and ability to lead; up to 300K EUR.",
      "PRC (Collaborative Research): assess consortium complementarity and joint added value.",
      "PRCE (Research-Enterprise): assess the credibility and value of the research-enterprise partnership.",
      "In rankings, favour proposals where the scientific aims are both ambitious and clearly achievable.",
      "Proposals that are scientifically sound but lack a convincing impact narrative can still rank highly."
    ].join("\n")
  },
  snsf: {
    name: "Swiss National Science Foundation",
    region: "CH",
    acceptanceRate: "~20-40% (declining)",
    scoringSystem: "1-9 scale with Bayesian ranking",
    keyCriteria: ["Track record", "Relevance and originality", "Methods and feasibility"],
    promptSection: [
      "You are calibrating this review to SNSF standards.",
      "SNSF acceptance rates range from 20-40% depending on the scheme, and are declining.",
      "Scoring uses a 1-9 scale; scores feed into a Bayesian ranking model across reviewers.",
      "Three criteria: Track record, Relevance and originality, Methods and feasibility.",
      "Empirically, Methods and feasibility carries the highest weight in funding decisions.",
      "Track record: Does the applicant's publication record demonstrate competence in this domain?",
      "Relevance and originality: Is the research question important and the approach genuinely novel?",
      "Methods and feasibility: Is the methodology sound, well-described, and achievable in the timeframe?",
      "Score 9: Outstanding — a truly exceptional proposal by international standards.",
      "Score 7-8: Excellent — strong proposal with minor weaknesses.",
      "Score 5-6: Good — sound but not among the strongest candidates.",
      "Score 3-4: Fair — significant weaknesses that reduce fundability.",
      "Score 1-2: Poor — fundamental problems; not competitive.",
      "The Bayesian model adjusts for reviewer stringency; score calibration to a 1-9 range is important."
    ].join("\n")
  },
  nwo: {
    name: "Dutch Research Council",
    region: "NL",
    acceptanceRate: "~14-20%",
    scoringSystem: "1-9 z-normalized; Quality (75%) + Impact (25%)",
    keyCriteria: ["Quality of the research (75%)", "Knowledge utilisation / Impact (25%)"],
    promptSection: [
      "You are calibrating this review to NWO standards.",
      "NWO accepts roughly 14-20% of proposals; Veni is the most competitive at ~14-15%.",
      "Scoring uses a 1-9 scale; scores are z-normalized across reviewers before weighting.",
      "Final score: Quality of the research (75%) + Knowledge utilisation / Impact (25%).",
      "Because z-normalization is applied, use the full 1-9 range consistently.",
      "Score 9: Excellent — proposal is outstanding; fund immediately.",
      "Score 7-8: Very Good — strong proposal, minor reservations.",
      "Score 5-6: Good — above average but below the typical funding threshold.",
      "Score 3-4: Sufficient — meets minimum standards but unlikely to be funded.",
      "Score 1-2: Insufficient — significant problems; should not be funded.",
      "Veni (up to 320K EUR/3yr): early career; assess independence and research maturity.",
      "Vidi (up to 850K EUR/5yr): mid-career; assess consolidation and leadership potential.",
      "Vici (up to 1.5M EUR/5yr): senior; assess vision, track record, and mentoring capacity.",
      "Knowledge utilisation includes societal, economic, and scientific uptake beyond the project."
    ].join("\n")
  },
  nih: {
    name: "National Institutes of Health",
    region: "US",
    acceptanceRate: "~20%",
    scoringSystem: "1-9 per criterion (1=exceptional, 9=poor), overall impact 10-90",
    keyCriteria: ["Significance", "Investigator(s)", "Innovation", "Approach", "Environment"],
    promptSection: [
      "You are calibrating this review to NIH standards.",
      "NIH accepts roughly 20% of applications; funding lines are percentile-based by institute.",
      "Each of five criteria is scored 1-9: Significance, Investigator(s), Innovation, Approach, Environment.",
      "1=Exceptional, 2=Outstanding, 3=Excellent, 4=Very Good, 5=Good, 6=Satisfactory, 7=Fair, 8=Marginal, 9=Poor.",
      "The Overall Impact score (10-90, multiplied by 10) reflects the proposal's potential to improve health.",
      "Significance: Does this advance scientific knowledge or clinical practice in a meaningful way?",
      "Investigator(s): Do the PI(s) have the expertise, training, and commitment to carry out the work?",
      "Innovation: Does the proposal challenge existing paradigms or develop novel methodologies?",
      "Approach: Are the design, methods, and analyses scientifically rigorous and feasible?",
      "Environment: Does the setting provide the resources and collaborations needed for success?",
      "R01 applications (~$250K/yr direct costs modular): the flagship NIH grant; rigorous review.",
      "R21 (exploratory/developmental, up to $275K/2yr): higher tolerance for risk in approach.",
      "R03 (small grants, up to $50K/yr/2yr): feasibility and pilot data are key.",
      "Human subjects, vertebrate animals, and biosafety sections must be assessed for compliance."
    ].join("\n")
  },
  nsf: {
    name: "National Science Foundation",
    region: "US",
    acceptanceRate: "~25%",
    scoringSystem: "Qualitative merit review; two equally weighted criteria",
    keyCriteria: ["Intellectual Merit", "Broader Impacts"],
    promptSection: [
      "You are calibrating this review to NSF standards.",
      "NSF accepts roughly 25% of proposals, varying significantly by directorate and programme.",
      "Two criteria are weighted equally: Intellectual Merit and Broader Impacts.",
      "Intellectual Merit: What is the potential to advance knowledge within and across fields?",
      "Broader Impacts: What are the potential benefits to society and the broader scientific community?",
      "Both criteria must be addressed explicitly in the review; neither can be ignored.",
      "Qualitative ratings: Excellent, Very Good, Good, Fair, Poor — applied to each criterion.",
      "NSF reviewers must also assess the overall merit of the proposal as a holistic judgement.",
      "CAREER grants (~$400-500K over 5 years): integrate research and education; both criteria amplified.",
      "For CAREER, the educational plan is a primary component — assess its vision and coherence.",
      "Assess feasibility: Does the team have the capacity and resources to achieve the stated goals?",
      "Prior NSF support: If the PI has prior NSF funding, assess the outcomes summary critically.",
      "Diversity, equity, and inclusion efforts within Broader Impacts should be assessed for substance.",
      "Do not penalise basic research for lacking immediate applications — Intellectual Merit stands alone."
    ].join("\n")
  },
  doe: {
    name: "Department of Energy",
    region: "US",
    acceptanceRate: "varies by programme",
    scoringSystem: "Weighted percentages: Merit 35-40%, Approach 25-30%, Personnel 20-25%, Budget 10-15%, Mission relevance 10-15%",
    keyCriteria: ["Scientific/Technical Merit", "Approach", "Personnel", "Budget", "Mission Relevance"],
    promptSection: [
      "You are calibrating this review to DOE Office of Science / ARPA-E standards.",
      "DOE acceptance rates vary widely; Office of Science BES/BER acceptance can be 10-20%.",
      "Scoring is weighted: Scientific/Technical Merit (35-40%), Approach (25-30%),",
      "  Personnel (20-25%), Budget (10-15%), Mission Relevance (10-15%).",
      "Scientific/Technical Merit: Is the science rigorous, original, and at the frontier of the field?",
      "Approach: Is the research plan detailed, feasible, and appropriately sequenced?",
      "Personnel: Do the PI and team have the expertise and track record for the proposed work?",
      "Budget: Is the proposed budget realistic, justified, and consistent with the scope of work?",
      "Mission Relevance: Does the work advance DOE's energy, science, or national security mission?",
      "Cost sharing is often required — assess whether it is credible and committed.",
      "Technology Readiness Level (TRL) context: Office of Science funds TRL 1-3 (basic research);",
      "  ARPA-E targets TRL 2-5 (applied/transformative energy research).",
      "For ARPA-E: transformative potential and pathway to deployment must be credible.",
      "For Office of Science: fundamental scientific contribution and relevance to DOE mission are primary."
    ].join("\n")
  },
  darpa: {
    name: "Defense Advanced Research Projects Agency",
    region: "US",
    acceptanceRate: "varies by BAA",
    scoringSystem: "Heilmeier Catechism + 5 review factors",
    keyCriteria: ["Overall scientific/technical merit", "Potential contribution to DARPA mission", "Innovativeness", "Cost realism", "Offeror qualifications"],
    promptSection: [
      "You are calibrating this review to DARPA standards.",
      "DARPA funds high-risk, high-reward research with explicit tolerance for ~50% failure.",
      "Primary framework is the Heilmeier Catechism: What are you trying to do (plain English)?",
      "  How is it done today, and what are the limits? What is new in your approach?",
      "  Who cares? What difference does success make? What are the risks and payoffs?",
      "  How much will it cost? How long will it take? What are mid-term and final exams?",
      "Five formal review factors: overall scientific/technical merit, potential contribution to DARPA mission,",
      "  innovativeness, cost realism, and offeror qualifications.",
      "Innovativeness is paramount: incremental improvements will not be funded regardless of technical quality.",
      "Rapid pivots are expected and valued — assess whether the team can adapt under uncertainty.",
      "Transition focus is critical: DARPA expects a clear path from research to military or commercial use.",
      "Do not penalise ambitious proposals for high risk — risk is expected and acceptable at DARPA.",
      "Proposals that are safe, predictable, or purely academic will score poorly on innovativeness.",
      "Assess feasibility through the lens of whether the team can deliver a working demonstration,",
      "  not whether the ultimate vision is guaranteed to succeed."
    ].join("\n")
  }
};

export const SUPPORTED_AGENCIES = Object.keys(AGENCIES);

export function getAgencyCalibration(agency) {
  if (!agency || typeof agency !== "string") {
    return null;
  }
  return AGENCIES[agency.toLowerCase().trim()] ?? null;
}
