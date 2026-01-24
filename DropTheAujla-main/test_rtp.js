function play(random) {
  const OUTCOMES = [
    { weight: 349230769, fixed: 0 },
    { weight: 260000000, min: 0.2, max: 0.6 },
    { weight: 220000000, min: 0.9, max: 1.4 },
    { weight: 130000000, min: 2.0, max: 3.2 },
    { weight: 40800001,  min: 5.0, max: 8.0 }
  ];

  const TOTAL = OUTCOMES.reduce((s, o) => s + o.weight, 0);
  let r = random() * TOTAL;

  let acc = 0;
  let o = OUTCOMES[OUTCOMES.length - 1];
  for (const x of OUTCOMES) {
    acc += x.weight;
    if (r < acc) {
      o = x;
      break;
    }
  }

  if (o.fixed !== undefined) return o.fixed;
  return o.min + random() * (o.max - o.min);
}

const ROUNDS = 5_000_000;
let total = 0;

for (let i = 0; i < ROUNDS; i++) {
  total += play(Math.random);
}

console.log("Rounds:", ROUNDS);
console.log("RTP:", total / ROUNDS);
