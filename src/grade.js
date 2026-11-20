// Grades the camera's notes and the time-per-word baseline against the reader's
// own marks. The marks are written before the reader sees any note, and the
// session file stores when (marks.savedAt < review.openedAt).

const POSITIVE_CAMERA = new Set(['gripped', 'amused']);

// `chance` is how many marked paragraphs a method would find by flagging the same number of
// paragraphs at random among those it could judge: marked x (flagged / judgeable). A result
// is only worth reporting next to it.
function prf(flags, truth, judgeable) {
  const hit = [...flags].filter((i) => truth.has(i)).length;
  return {
    flagged: flags.size, marked: truth.size, found: hit,
    recall: truth.size ? hit / truth.size : null,
    precision: flags.size ? hit / flags.size : null,
    judgeable,
    chance: judgeable ? Math.round(((truth.size * flags.size) / judgeable) * 10) / 10 : null,
  };
}

const JUDGED = new Set(['steady', 'amused', 'gripped', 'drifting']);

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
  const camN = notes.filter((n) => JUDGED.has(n.camera)).length;
  const dwellN = notes.filter((n) => n.dwell !== 'unseen').length;
  return {
    camera: { got: prf(cam.got, got, camN), lost: prf(cam.lost, lost, camN) },
    dwell: { got: prf(dwell.got, got, dwellN), lost: prf(dwell.lost, lost, dwellN) },
    refused: notes.filter((n) => n.camera === 'no-reading').map((n) => ({ i: n.i, reason: n.reason })),
  };
}
