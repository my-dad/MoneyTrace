# Sources from SMS, and the credit/debit rule (piece 2 of 4): design

Date: 2026-11-12. Status: written for Mabrur's review.
Change request: PRD CR-008. Branch: `sources-from-sms`, from `master`.

## 1. Intent

What Mabrur said on 2026-11-12:

- Don't create or assume anything; read the SMS. DeepSeek is smart enough to tell credit from debit, wallet from bank account, transfer from card, and so on.
- Put a chip under each transaction showing where it came from: bKash, Upay, Nagad, a bank account, a card.
- When a bank account, card or wallet reference in a new SMS hasn't been seen before, store it for future reference.
- When an SMS isn't in a format the fixed rules know, DeepSeek reads it, and if anything is unclear, DeepSeek asks questions until the answer is clear.
- Card type doesn't matter (credit or debit card, Amex or not). Only credit versus debit matters.
- **Any credit counts in Came in, except a credit that matches a debit from one of your own sources** (the same amount, around the same time). That pair is a transfer and counts in neither total (option 2, chosen over "every credit, always").

Success: a new user pastes bank, card and wallet SMS with no setup and no "which account?" questions. Spent and Came in are right, and a transfer between their own accounts is never counted as both spending and income.

## 2. The rule

| SMS says | Counts as | Chip |
|---|---|---|
| Debit (purchase, payment, bill, fee) | Spent | the source, e.g. `MTB card ••2222` |
| Credit (salary, money received, refund) | Came in | the source, e.g. `BRAC ••8888` |
| ATM withdrawal | Not spending: bank → Cash (unchanged from Phase 1, including "Where did the ৳X go?") | `BRAC ••8888` → `Cash` |
| A debit and a credit of the same amount on two different sources of yours, close in time | Transfer: counts in neither | `Transfer` plus both sources |
| A cash note ("paid 500 for rickshaw") | Spent | `Cash` |

How a transfer is recognised:

- **Pairing:** a debit and a credit pair when they have the same amount and currency, are on different sources, are in opposite directions, and are within **30 minutes** of each other by the SMS times. This happens automatically when exactly one candidate fits.
- **Same day, or several candidates:** the chat asks once: "Was this ৳10,000 your own transfer from BRAC ••8888?"
- **Payment-type wording with no matching debit** (for example a card's "payment credited" message): the chat asks once instead of counting it as income.
- **Order doesn't matter.** If the first half was already recorded as Spent or Came in, it is corrected into a transfer through the ledger's normal reverse-and-replace, with an audit trail and nothing deleted.

Refunds count in Came in, as Mabrur's rule says. They don't lower Spent.

## 3. Sources

- **A source** is anything money moves in or out of: a bank account, a card, bKash, Upay, Nagad, or Cash. Its reference is read from the SMS: the bank or wallet name (from the fixed parser, or from DeepSeek), and the last 3–4 digits when the SMS shows them.
- **Remembered automatically:** the first time a reference appears, the source is stored, and later SMS with the same reference use it. There are no questions and no setup.
  - Two references at different banks with the same ending stay separate, because the bank name is part of the reference.
  - If one SMS fits two stored sources, the chat asks.
- **Names come from the SMS,** e.g. "BRAC ••8888", "MTB card ••2222", "bKash". Nothing is typed by the user.
- **Cash:** a "Cash" source is created at sign-up (alongside the existing system wallet for unexplained cash).
- **Ledger:** behind the scenes every source is an ordinary money account. A card is just a source whose total goes below ৳0 as you spend; paying its bill is a transfer from the bank to the card. The user only sees chips.

## 4. What the user sees

- **Chips:**
  - Recent rows show the source chip(s) under the title. A transfer shows a `Transfer` chip and both sources.
  - The chat shows the same chips on each recorded message.
- **Dashboard:**
  - "Money now" (Banks and cash / Cards owed) becomes **Net money**: all money in minus all money out across every source since tracking started.
  - Below it is a short list, **Sources**, with each source's chip and its own in and out totals for the month.
  - Spent, Came in, unexplained cash, categories and the comparison line are unchanged.
- **Unrecognised formats:** every pasted SMS is already kept with account numbers masked. An SMS the fixed rules couldn't read is marked "read by AI". Those are the examples for adding new fixed rules later. Nothing new is stored, and nothing leaves the user's data.

### DeepSeek asks until it's clear

When the fixed rules can't read a message, DeepSeek reads it. If DeepSeek can't tell something it needs (credit or debit, the amount, the source, whether it's a transfer, the category), it asks in the chat:

1. **The question** appears under the pasted message as a chat message from MoneyTrace, in plain words, for example: "Was this ৳2,000 paid from your bKash, or received into it?"
2. **The user types or taps an answer.** The answer belongs to the same pasted message; it doesn't become new evidence.
3. **DeepSeek reads again,** with the original text plus every question and answer so far. It either asks one more question or gives a complete reading.
4. **Once the reading is complete,** the chat shows it with its chip(s), "৳2,000 · Spent · bKash · Record it?", and records it on the user's tap. The AI never records anything by itself, which keeps the rule that AI proposes and deterministic code posts.

Limits:

- **At most 3 questions per message.** After that, the chat shows the reading so far with the normal Record and Fix choices, so a message can't loop forever.
- **Budget:** each round is one DeepSeek call and counts against the AI budget. When the budget is used up, the message waits with "AI budget reached", as today.
- **Privacy:** questions and answers are kept with the message (in the existing conversation records, 365-day retention). DeepSeek is sent only the masked SMS text and the chat answers, never account numbers.

## 5. Changes

- **Contracts:**
  - DeepSeek's output schema gains the source reference it reads: `sourceName` (bank or wallet name) and optional `sourceMask` (last 3–4 digits). This lets an AI-read SMS remember its source too (today AI candidates carry no provider; review minor M9).
  - The output can instead be a **question** (`{ "kind": "question", "text": … }`) when something needed is unclear. It is schema-validated like every AI output, and the question text is shown as written but never treated as an instruction.
  - The prompt version goes up.
  - The interpret request carries the conversation so far (questions and the user's answers) for that one message.
- **Pipeline:**
  - **Match stage:** when no stored source fits, create the source and its reference atomically. This is idempotent by owner + bank or wallet name + digits, so two identical SMS can never create two sources.
  - **Pairing:** the 30-minute rule above. If the other half is already posted, the posting is corrected into a transfer.
  - **Intent mapping:**
    - debit → purchase funded by the source;
    - credit → income to the source;
    - card purchase → purchase funded by the card source;
    - card repayment → transfer when paired, otherwise ask.
- **Messages:** a new callable, `answerQuestion({ sourceEventId, text })`. It stores the answer with the message and sends it back to interpret, with a 3-question limit per message.
- **Web:**
  - chips in Recent and the chat;
  - DeepSeek's questions and the user's answers shown under the pasted message, with a reply box;
  - Net money and Sources on the dashboard;
  - the chat question for an uncertain transfer.
- **Not changed:** withdrawal handling and its question, corrections, quotas, the AI boundary (AI proposes; deterministic code decides and posts), and sign-in.

## 6. Errors and edge states

- **No bank or wallet name** in the SMS and none from DeepSeek: the chat asks which source, or offers a new one named by the user.
- **Unknown currency:** asks, as today.
- **Both halves of a transfer pasted at once:** they pair when the second is processed. Pairing is idempotent, so retries never double-correct.
- **A transfer answered "No, not mine":** both stay as recorded, Spent and Came in.
- **DeepSeek's question can't be answered** (the user doesn't know): the user taps "Skip". The message then shows the reading so far with Record and Fix, or Reject.
- **An answer that looks like a secret** (an OTP or PIN typed by mistake) is refused before it's stored or sent, with the same check as pasted evidence.

## 7. Testing

- **Unit (domain and application):**
  - every row of the rule table;
  - automatic pairing in both orders;
  - same day versus 30 minutes;
  - two candidates ask;
  - correction into a transfer when the first half was already posted;
  - idempotent source creation (two identical SMS → one source);
  - two banks with the same ending → two sources;
  - a refund counts in Came in;
  - a cash note uses Cash;
  - DeepSeek asks a question, the answer is sent back with the history, and the next reading posts after Record;
  - the 3-question limit falls back to Record and Fix;
  - an answer containing an OTP is refused.
- **Corpus:** every corpus SMS creates or reuses the right source, with no questions for formats that name their source.
- **Emulator end-to-end:** sign in, then paste a salary SMS (Came in rises, chip shows the bank). Paste a BRAC → bKash transfer pair (both totals unchanged, `Transfer` chip). Paste a card purchase (Spent rises, chip shows the card).
- **Commands:** `pnpm verify`, the build, `pnpm test:emulator`, `pnpm test:e2e` and `pnpm test:e2e:fixture`.

## 8. Delivery

1. HTML mockup of the chips, Net money and Sources, and the transfer question, for Mabrur's approval.
2. Then: contracts and prompt, sources and pairing in the pipeline, the dashboard, the chat, and a final whole-branch review.

`docs/superpowers/progress/sources-from-sms.md` is updated after every task.

## 9. Risks

- **Close coincidences:** two unrelated equal amounts within 30 minutes on different sources would be paired. The ledger correction is reversible, and the chat shows the `Transfer` chip so it can be undone with "not a transfer" (built 2026-11-13: `splitTransfer`, plan `2026-11-13-cash-count-and-transfer-undo.md`).
- **Per-source totals:** these are net in and out since tracking began, not bank-statement balances, because nothing is entered at setup (CR-006).
- **Refunds:** these raise Came in rather than lowering Spent, by Mabrur's rule.
