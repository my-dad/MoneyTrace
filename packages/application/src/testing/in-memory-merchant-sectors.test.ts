import { describeMerchantSectorContract } from "./merchant-sector-contract";
import { InMemoryMerchantSectors } from "./in-memory-merchant-sectors";

describeMerchantSectorContract("in memory", () => Promise.resolve(new InMemoryMerchantSectors()));
