import { InMemoryProfiles } from "./in-memory-profiles";
import { describeProfileContract } from "./profile-contract";

describeProfileContract("in memory", () => Promise.resolve(new InMemoryProfiles()));
