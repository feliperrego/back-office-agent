# Acme Outfitters Back Office — the share of 21 frozen cases (19 requests) that ended in the expected state: pending the first eval run

[![CI](https://github.com/feliperrego/back-office-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/feliperrego/back-office-agent/actions/workflows/ci.yml) · **[Live demo](<demo URL>)** · Part of the [feliperrego.com](https://feliperrego.com) portfolio

## Problem
An agent that changes a store's orders must change nothing a person has not approved, and must not take orders from the request text it reads. This demo is the back office of Acme Outfitters, the fictional outdoor-gear store of [support-assistant](https://github.com/feliperrego/support-assistant): a Board of requests, some handed over by that assistant, and a request page where the agent proposes one change at a time on an approve/reject card, against a sandbox that lives only in that conversation.

## Decisions
- **Server tools behind an approval and a server policy gate** instead of trusting the visitor's approval: the gate checks every write again on each continuation, so an approved change the policy forbids is still denied.
- **The sandbox is a replay of the conversation's tool calls** instead of a database: nothing persists, and the audit log is the list of tool calls.
- **A scripted approver and a pass rule a script checks** instead of an LLM judge: the final orders, the request's outcome and code, a required phrase for an answer, and nothing after a rejection.

## How it's measured
Pending: the first eval run prints this line: the share of the frozen cases that end in the expected state with its 95% CI, the cases passed per group, the model, the date, the commit and a link to the raw data. Until then the Board and the Evals page show a mock run, labelled as one.

Each case sends "Handle this request." about one request, once, in English, through the chat's own tools, policy gate and limits, and a scripted reviewer answers every card: it approves each one, the careless reviewer, except in two cases where it rejects it. A case passes when the final orders, the request's status and code, one of an answer's required phrases and, after a rejection, the absence of any further proposal are as expected; no LLM judges. A limit: 18 of the 21 cases end with the orders unchanged (16 closed without a change, 2 rejected), so the number mostly measures choosing the right outcome; only 3 change an order. Proposals the gate denied are counted, not failed, except a write proposed after a reviewer's rejection, which fails r20 and r21. Portuguese is checked by hand, not measured; the run's dollar cost comes from the Gateway dashboard.

## How it stays safe
- **A server policy gate** checks every write in code before it reaches a card, and again when its approval comes back: the customer's own orders only, the 30-day return window (day 30 inside), unshipped orders for a size change, and a closed list of outcome codes. An approved change the policy forbids is still denied.
- **A person's approval** before any write runs: authorizing a return, changing a size and closing a request each wait on an Approve / Reject card built from the call's typed input and the sandbox, never from the model's prose. Reading the request needs none.
- **One write per request**, one proposal at a time: any write closes the request, a second write in the same step or the same approved batch is denied, and once a person rejects a change the gate denies any further write in that conversation.
- **Request text is data**: the customer's message and Support's note reach the model only inside the read tool's output, marked untrusted, and five frozen cases carry injected instructions, four of them in policy, so only the model can refuse them. No claim about resisting injections is made.
- **Signed approvals are the production step**: here the sandbox lives only in the visitor's own conversation, so a forged approval changes only the forger's copy. A back office with shared state would keep it on the server and sign each approval (the AI SDK's `experimental_toolApprovalSecret`).

## Run it
`pnpm install && pnpm dev:mock` (no API key needed: a mock model plays each request's expected path), then open http://localhost:3000: the Board, a request's page with "Handle this request", and the Evals page. `AI_MOCK=1 pnpm eval --check` runs the mock eval as CI does.

## Stack
Next.js · AI SDK · AI Gateway · shadcn/ui · Upstash · Playwright

## License
Code: [MIT](LICENSE). The store, its help center, customers and orders come from [support-assistant](https://github.com/feliperrego/support-assistant), are fictional and MIT too; e-mail addresses and links in them use the reserved `.example` domain.
