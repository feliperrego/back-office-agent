import type { UIMessage } from "ai";
import type { ProposedCall } from "@/lib/sandbox/calls";
import { fold, type NotApplied } from "@/lib/sandbox/fold";
import { apply, openSandbox, propose, type Decision, type Sandbox } from "@/lib/sandbox/sandbox";

/**
 * One request's sandbox for one POST (spec §4.2, P2-18): folded once from the validated history,
 * then read and changed by the gate and by every execute of that POST, which the tools reach
 * through the server's tool context (lib/tools.ts). The SDK checks the calls of one step one
 * after another against the same messages, and runs the approved calls of a continuation
 * together (ai execute-tools-from-stream.ts, stream-text.ts); so one object, changed one call at
 * a time, is what keeps a second write of the same step or batch from passing. Server-side and in
 * memory: nothing outlives the request.
 */
export class RequestSession {
  readonly requestId: string;
  /** Executed writes of the history that the fold did not apply (spec §5's hard failure). */
  readonly notApplied: readonly NotApplied[];
  private current: Sandbox;

  constructor(requestId: string, messages: readonly UIMessage[]) {
    const folded = fold(openSandbox(requestId), messages);
    this.requestId = requestId;
    this.notApplied = folded.notApplied;
    this.current = folded.sandbox;
  }

  /** The sandbox as the writes so far left it. */
  get sandbox(): Sandbox {
    return this.current;
  }

  /** The gate's step: an allowed write becomes the one pending proposal (B7). */
  propose(call: ProposedCall): Decision {
    const { decision, sandbox } = propose(call, this.current);
    this.current = sandbox;
    return decision;
  }

  /** Runs an approved write, checked again first; throws SandboxDenied for a denied one. */
  run(call: ProposedCall): Sandbox {
    this.current = apply(call, this.current);
    return this.current;
  }
}
