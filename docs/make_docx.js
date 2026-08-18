// make_docx — generates docs/design-intent.docx by hand (zip + XML, no
// docx library), counts body words and FAILS THE BUILD when over 500,
// writes no author metadata (§26). Template sections exactly as given.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SECTIONS = [
  ['1. Game title and genre',
   `BLIND SPOT — Tower Defense & Strategy.`],

  ['2. Target player and pitch',
   `For systems and optimisation players who enjoy reading a live system and moving one dial well. You run a city's traffic-camera network. The cameras are towers that produce information instead of damage: they log plates, plates build cases, cases pay for more cameras. Close too few cases and you are relieved; charge too many wrong people and you are also relieved. A session is ten minutes of placement, judgement, recovery.`],

  ['3. How to play (controls)',
   `Portrait, one thumb. Tap any intersection: a menu of cameras and works opens. Pick a unit; a ghost appears quoting the best and worst read from that pole; CONFIRM mounts it (the Long aims with turn arrows first). Drag the top-strip slider to move the evidence bar. On a contested card, press CHARGE or RELEASE. Drag pans, pinch zooms, tapping anything makes it name itself.`],

  ['4. Core loop',
   `Place a camera; passing vehicles produce plate reads at a confidence set by distance, angle, road class, weather, and lens condition — never by dice. Reads above your bar become evidence; three reads tracing a coherent route close a case and pay budget. Evidence decays twice over: cameras store footage locally and upload on a cycle, so a pole destroyed before upload erases what it saw, and uploaded footage still ages off the drives. Ambiguous files surface as contested cards to charge or release; charging the wrong plate still pays, but burns the trust that keeps tips and full payouts coming — that misaligned reward is the deliberate trap. Crews remember which cameras saw them and route around them, so your best camera decays because it is your best; relocating is the counter. Win by completing the syndicate warrant before it leaks away; lose by clearance or trust hitting a floor; after shift nine, overtime escalates until the Commissioner's Review weighs the board and rules either way — refusably. Every read flashes on the road, grey when it misses; moving the bar recolours the whole board at once.`],

  ['5. What is in this prototype',
   `Implemented and playable: seeded deterministic city generation; three camera types plus a relay; sightlines and confidence; the threshold dial; cases, contested adjudication, retention and upload cycles; three vandal types — degraded cameras keep reporting, worse; crews that learn only from being sighted; nine authored shifts, rain, a scripted shift-five strike, overtime, the weighed Review; budget, clearance, trust, warrant; guided tutorial, self-playing demo, save and resume; synthesised audio. Not yet in: multiple districts, officer units, pursuit, court outcomes, day-night cycle, campaign.`],

  ['6. Progression and signature twist',
   `Shifts compress in cadence while open cases pile against a retention window that never grows; vandals arrive at three, a fixer strikes your best camera at five, rain moves the bar at six, crews visibly reroute at seven. The mechanic to validate: cameras watching cameras — vandalism inside another camera's sightline gets recorded, and the recording becomes the case that catches the crew.`],

  ['7. Future-state vision',
   `A persistent city of districts where crews carry learned routes between sessions, more unit and case types, and a campaign following the analyst from precinct to precinct.`]
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const words = SECTIONS.reduce((n, [, body]) => n + body.trim().split(/\s+/).length, 0);
console.log(`design intent body: ${words} words`);
if (words > 500) {
  console.error(`FAIL: over the 500-word limit by ${words - 500}`);
  process.exit(1);
}

let bodyXml = '';
for (const [head, body] of SECTIONS) {
  bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${esc(head)}</w:t></w:r></w:p>`;
  bodyXml += `<w:p><w:r><w:t xml:space="preserve">${esc(body)}</w:t></w:r></w:p>`;
}

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}<w:sectPr/></w:body></w:document>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const stage = path.join(__dirname, '_docx_stage');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, '_rels'), { recursive: true });
fs.mkdirSync(path.join(stage, 'word'), { recursive: true });
fs.writeFileSync(path.join(stage, '[Content_Types].xml'), contentTypes);
fs.writeFileSync(path.join(stage, '_rels', '.rels'), rels);
fs.writeFileSync(path.join(stage, 'word', 'document.xml'), documentXml);

const out = path.join(__dirname, 'design-intent.docx');
fs.rmSync(out, { force: true });
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${stage}\\*' -DestinationPath '${out}.zip'; Move-Item '${out}.zip' '${out}'"`);
fs.rmSync(stage, { recursive: true, force: true });
console.log(`wrote ${out} (${fs.statSync(out).size} bytes, ${words}/500 words, no author metadata)`);
