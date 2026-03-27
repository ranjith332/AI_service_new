export interface TokenRechargePackage {
  code: string;
  name: string;
  description: string;
  amountInr: number;
  tokens: number;
}

export interface TokenSubscriptionPlan {
  code: string;
  name: string;
  description: string;
  amountInr: number;
  tokensPerCycle: number;
  intervalType: "DAY" | "WEEK" | "MONTH" | "YEAR";
  intervalCount: number;
  maxCycles: number;
  authorizationAmount: number;
  paymentMethods: string[];
}

export const tokenRechargePackages: TokenRechargePackage[] = [
  {
    code: "starter_500",
    name: "Starter 500",
    description: "500 AI tokens for smaller hospitals and front-desk trial usage.",
    amountInr: 499,
    tokens: 500
  },
  {
    code: "growth_2500",
    name: "Growth 2500",
    description: "2,500 AI tokens for routine appointment, billing, and records queries.",
    amountInr: 1999,
    tokens: 2500
  },
  {
    code: "scale_10000",
    name: "Scale 10000",
    description: "10,000 AI tokens for high-volume hospitals running daily AI workflows.",
    amountInr: 6999,
    tokens: 10000
  }
];

export const tokenSubscriptionPlans: TokenSubscriptionPlan[] = [
  {
    code: "monthly_3000",
    name: "Monthly 3000",
    description: "3,000 tokens every month for regular AI-assisted operations.",
    amountInr: 2499,
    tokensPerCycle: 3000,
    intervalType: "MONTH",
    intervalCount: 1,
    maxCycles: 0,
    authorizationAmount: 1,
    paymentMethods: ["upi", "card"]
  },
  {
    code: "monthly_12000",
    name: "Monthly 12000",
    description: "12,000 tokens every month for hospitals with heavier AI usage.",
    amountInr: 7999,
    tokensPerCycle: 12000,
    intervalType: "MONTH",
    intervalCount: 1,
    maxCycles: 0,
    authorizationAmount: 1,
    paymentMethods: ["upi", "card", "enach"]
  }
];

export function getRechargePackage(code: string) {
  return tokenRechargePackages.find((item) => item.code === code) ?? null;
}

export function getSubscriptionPlan(code: string) {
  return tokenSubscriptionPlans.find((item) => item.code === code) ?? null;
}
