import { InMemoryRateLimiter } from "./in-memory-rate-limiter";
import { describeRateLimiterContract } from "./rate-limiter-contract";

describeRateLimiterContract("in-memory", () => Promise.resolve(new InMemoryRateLimiter()));
