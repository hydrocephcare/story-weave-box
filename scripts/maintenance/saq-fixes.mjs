// Source errors found while reading a post, corrected before it is formatted. Each entry is [text to find, text to put there].
// They are listed in the report to the owner, so nothing is changed silently.
export const FIXES = {
  // Medical Physiology Assorted SAQs: the answer to question 4 is about steroid hormones, so the stem said the wrong thing.
  // Question 1 had no answer at all.
  "6cfdcda1": [
    ["**4. Describe how protein hormones stimulate protein synthesis**", "**4. Describe how steroid hormones stimulate protein synthesis**"],
    // Question 13: the Greek letters (alpha, beta, gamma) were lost when the file was converted
    [
      /G protein releases GDP from\s+GDP unit\. The\s+subunit now binds with a new molecule of GTP\. This triggers the dissociation of\s+GTP unit and\s*-?\s*dimmer from the receptor\. The\s+GTP and\s+dimmer unit now activates/,
      "G protein releases GDP from the α-GDP unit. The α subunit now binds a new molecule of GTP. This triggers dissociation of the α-GTP unit and the βγ dimer from the receptor. The α-GTP unit now activates",
    ],
    [
      "**1. With a diagram describe the different components of a negative feedback system**\n",
      "**1. With a diagram describe the different components of a negative feedback system**\n\n**Model answer:** A negative feedback system has five parts. (1) The controlled variable is the quantity being held steady, for example blood glucose or body temperature. (2) The sensor (receptor) detects the value of that variable. (3) The control centre (integrator) compares the value with the set point and decides what to do. (4) The effector carries out the response that moves the variable back towards the set point. (5) The feedback signal returns information about the new value to the sensor, so the response switches off when the set point is reached. The key feature is that the response opposes the original change.\n",
    ],
  ],
};
