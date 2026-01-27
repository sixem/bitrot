// Analog-style filter chain for the first non-GOP effect (legacy filename).
export const buildAnalogFilter = () =>
  [
    "eq=contrast=1.08:saturation=1.25",
    "noise=alls=14:allf=t+u",
    "unsharp=5:5:0.6:5:5:0.0"
  ].join(",");
