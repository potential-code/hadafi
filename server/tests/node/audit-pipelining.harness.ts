/**
 * Runs under real Node (not Bun): production serves with Node, and Node's
 * http server treats pipelined requests differently from Bun's. Bundled and
 * started by admin-audit-log.test.ts.
 *
 * A minimal Express app with the audit middleware and a stand-in for
 * authenticate(). Audit rows are printed to stdout as JSON lines instead of
 * being written to the database. Prints "listening <port>" when ready.
 */
import express from "express";
import { auditAdminActions, auditActorKnown, auditSink } from "../../middleware/audit-log";

auditSink.write = async (row) => {
  process.stdout.write(`row ${JSON.stringify({ path: row.path, statusCode: row.statusCode })}\n`);
};

const app = express();
app.use(express.json());
app.use("/api", auditAdminActions);
// Stand-in for authenticate(): the caller is identified after a short lookup.
app.use("/api", (req, res, next) => {
  setTimeout(() => {
    req.user = { userId: "00000000-0000-4000-8000-000000000000", role: "admin", via: "operator_key", keyLabel: "harness" };
    auditActorKnown(res);
    next();
  }, 5);
});
// A handler that takes a moment, so later pipelined requests queue behind it.
app.post("/api/things/:id", (req, res) => {
  setTimeout(() => {
    res.status(204).end();
  }, 50);
});

const server = app.listen(0, "127.0.0.1", () => {
  const address = server.address();
  process.stdout.write(`listening ${typeof address === "object" && address ? address.port : 0}\n`);
});
