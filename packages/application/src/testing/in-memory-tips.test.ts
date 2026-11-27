import { InMemoryTips } from "./in-memory-tips";
import { describeTipsRepositoryContract } from "./tips-contract";

describeTipsRepositoryContract("in memory", () => Promise.resolve(new InMemoryTips()));
