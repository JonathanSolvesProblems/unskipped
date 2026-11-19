// Grades the camera's notes and the time-per-word baseline against the reader's
// own marks. The marks are written before the reader sees any note, and the
// session file stores when (marks.savedAt < review.openedAt).

const POSITIVE_CAMERA = new Set(['gripped', 'amused']);

function prf(flags, truth) {
  const hit = [...flags].filter((i) => truth.has(i)).length;
  return {
    flagged: flags.size, marked: truth.size, found: hit,
    recall: truth.size ? hit / truth.size : null,
    precision: flags.size ? hit / flags.size : null,
  };
}

export function grade(notes, marks) {
  const got = new Set(marks.got || []);
  const lost = new Set(marks.lost || []);
  const cam = {
    got: new Set(notes.filter((n) => POSITIVE_CAMERA.has(n.camera)).map((n) => n.i)),
    lost: new Set(notes.filter((n) => n.camera === 'drifting').map((n) => n.i)),
  };
  const dwell = {
    got: new Set(notes.filter((n) => n.dwell === 'lingered').map((n) => n.i)),
    lost: new Set(notes.filter((n) => n.dwell === 'skimmed').map((n) => n.i)),
  };
  return {
    camera: { got: prf(cam.got, got), lost: prf(cam.lost, lost) },
    dwell: { got: prf(dwell.got, got), lost: prf(dwell.lost, lost) },
    refused: notes.filter((n) => n.camera === 'no-reading').map((n) => ({ i: n.i, reason: n.reason })),
  };
}
