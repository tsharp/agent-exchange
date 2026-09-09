let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

const exchange = JSON.parse(input);
const event = exchange.request?.event;

if (event === "SessionStart") {
  process.stdout.write(JSON.stringify({
    skills: ["hook-test-skill"],
    context: ["The drowned bell belongs to the harbor oracle."],
  }));
} else if (event === "Stop") {
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason: "The external quality gate requires one more revision.",
    context: ["The clue chain does not yet expose an actionable lead."],
  }));
} else {
  process.stdout.write("{}");
}
