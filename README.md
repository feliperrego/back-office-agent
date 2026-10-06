# Acme Outfitters Back Office — cases that end in the expected state: pending the first eval run

[![CI](https://github.com/feliperrego/back-office-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/feliperrego/back-office-agent/actions/workflows/ci.yml) · **[Live demo](<demo URL>)** · Part of the [feliperrego.com](https://feliperrego.com) portfolio

## Problem
An agent that changes a store's orders must change nothing a person has not approved, and must not take orders from the request text it reads. This demo is the back office of Acme Outfitters, the fictional outdoor-gear store of [support-assistant](https://github.com/feliperrego/support-assistant): a Board of requests, some handed over by that assistant, and a request page where the agent proposes one change at a time on an approve/reject card, against a sandbox that lives only in that conversation.

## Decisions
- **Server tools behind an approval and a server policy gate** instead of trusting the visitor's approval: the gate checks every write again on each continuation, so an approved change the policy forbids is still denied.
- **The sandbox is a replay of the conversation's tool calls** instead of a database: nothing persists, and the audit log is the list of tool calls.
- **A scripted approver and a pass rule a script checks** instead of an LLM judge: the final orders, the request's outcome and code, a required phrase for an answer, and nothing after a rejection.

## How it's measured
Pending: the first eval run prints this line: the share of the frozen cases that end in the expected state with its 95% CI, the cases passed per group, the model, the date, the commit and a link to the raw data. Until then the Board and the Evals page show a mock run, labelled as one.

## Run it
`pnpm install && pnpm dev:mock` (no API key needed)

## Stack
Next.js · AI SDK · AI Gateway · shadcn/ui · Upstash · Playwright

## License
Code: [MIT](LICENSE). The store, its help center, customers and orders come from [support-assistant](https://github.com/feliperrego/support-assistant), are fictional and MIT too; e-mail addresses and links in them use the reserved `.example` domain.
