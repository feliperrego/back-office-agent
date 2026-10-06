import { BoardView } from "@/components/board/board-view";
import { boardData } from "@/lib/board/board";
import { readCaseSet } from "@/lib/eval/cases";
import {
  EVALS_PAGE,
  type BackOfficeCase,
  type BackOfficeExtra,
  type BackOfficeResult,
} from "@/lib/eval/project";
import { readShownRun } from "@/lib/eval/runs";
import { evalsView } from "@/lib/eval/view";
import { REQUESTS } from "@/lib/sandbox/requests";
import { storeData } from "@/lib/store/customers";

/**
 * The Board, the home page (P2's spec §1 item 1; W-P6: P2's home is the Board), inside the app
 * shell. Project-owned. It reads the shown run and the frozen cases on the server, at build time,
 * as the Evals pages do, and passes the client view their data: the run's headline as /evals
 * states it, and the lanes (lib/board/board.ts). It names itself in no title: the home page keeps
 * the product's name.
 */
export default function Board() {
  const shown = readShownRun<BackOfficeResult, BackOfficeExtra>();
  const board = boardData({
    requests: REQUESTS,
    customers: storeData.customers,
    cases: readCaseSet<BackOfficeCase>().cases,
    run: shown.run,
    caseHref: EVALS_PAGE.caseHref,
  });
  return (
    <BoardView
      board={board}
      evals={evalsView(shown, EVALS_PAGE)}
      evalsHref={EVALS_PAGE.evalsHref}
    />
  );
}
