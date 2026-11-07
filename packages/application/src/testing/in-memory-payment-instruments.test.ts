import { describePaymentInstrumentContract } from "./payment-instrument-contract";
import { InMemoryPaymentInstruments } from "./in-memory-payment-instruments";

describePaymentInstrumentContract("in-memory", () =>
  Promise.resolve(new InMemoryPaymentInstruments()),
);
