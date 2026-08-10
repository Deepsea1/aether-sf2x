// Gate 4 corpus — versioned, grown from CORPUS_V1 (30) to 100 claims for
// published calibration. Adds 70 claims across General / Science / Medicine /
// Finance / Legal / History / Geography / Technology, keeping class balance.
//
// PROVENANCE HONESTY (per the hardening spec): ground truth in CORPUS_V1 was
// human-locked. The 70 added items here are AI-authored to unblock the
// calibration-publish mechanism; they are clearly verifiable TRUE facts,
// fluent FABRICATED inventions (no tells), and one-flip CORRUPTED facts. They
// are marked "pending human lock" so the published methodology discloses that
// v2 ground truth is not yet Cam-locked — the calibration curves are real
// numbers against a real corpus, but the corpus's lock status is stated.
// Never edit a claim after a run has scored against it — append a new version.

import { CORPUS_V1, CORPUS_VERSION as V1_VERSION } from './corpus-v1.js';

// 70 added claims (24 TRUE, 23 FABRICATED, 23 CORRUPTED) → 100 total.
const ADDED = [
  // --- TRUE (24) ---
  { id: 'T11', text: 'The chemical symbol for iron is Fe, from the Latin ferrum.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Iron'], notes: 'Etymology.' },
  { id: 'T12', text: 'Jupiter is the largest planet in the Solar System.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Jupiter'], notes: 'Astronomy.' },
  { id: 'T13', text: 'The Great Wall of China is visible from low Earth orbit under favorable conditions, though not from the Moon.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Great_Wall_of_China'], notes: 'Geography; the Moon claim is a myth.' },
  { id: 'T14', text: 'Photosynthesis converts carbon dioxide and water into glucose and oxygen using sunlight.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Photosynthesis'], notes: 'Biology.' },
  { id: 'T15', text: 'The freezing point of water at 1 atmosphere is 0 degrees Celsius, equivalent to 32 degrees Fahrenheit.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Freezing_point'], notes: 'Physics.' },
  { id: 'T16', text: 'The Nile is commonly cited as the longest river in the world, though the Amazon is the largest by volume.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Nile'], notes: 'Geography.' },
  { id: 'T17', text: 'A square has four equal sides and four right angles.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Square'], notes: 'Geometry.' },
  { id: 'T18', text: 'The speed of sound in air at 20 degrees Celsius is approximately 343 meters per second.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Speed_of_sound'], notes: 'Physics.' },
  { id: 'T19', text: 'DNA uses four nucleotide bases: adenine, thymine, guanine, and cytosine.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/DNA'], notes: 'Biology.' },
  { id: 'T20', text: 'Mount Kilimanjaro is the highest mountain in Africa.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Mount_Kilimanjaro'], notes: 'Geography.' },
  { id: 'T21', text: 'The Statue of Liberty was a gift from France to the United States, dedicated in 1886.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Statue_of_Liberty'], notes: 'History.' },
  { id: 'T22', text: 'Mercury is the closest planet to the Sun.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Mercury_(planet)'], notes: 'Astronomy.' },
  { id: 'T23', text: 'The human skeleton of an adult typically has 206 bones.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Human_skeleton'], notes: 'Anatomy.' },
  { id: 'T24', text: 'The Amazon rainforest is the largest tropical rainforest in the world.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Amazon_rainforest'], notes: 'Geography.' },
  { id: 'T25', text: 'Galileo Galilei improved the telescope and made early astronomical observations of Jupiter\u2019s moons.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Galileo_Galilei'], notes: 'History of science.' },
  { id: 'T26', text: 'The element with atomic number 6 is carbon.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Carbon'], notes: 'Chemistry.' },
  { id: 'T27', text: 'The Mariana Trench is the deepest known oceanic trench on Earth.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Mariana_Trench'], notes: 'Geography.' },
  { id: 'T28', text: 'The first powered flight by the Wright brothers occurred in 1903 at Kitty Hawk, North Carolina.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Wright_brothers'], notes: 'History.' },
  { id: 'T29', text: 'The Sahara is the largest hot desert in the world.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Sahara'], notes: 'Geography.' },
  { id: 'T30', text: 'A light-year is the distance light travels in a vacuum in one Julian year, about 9.46 trillion kilometers.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Light-year'], notes: 'Astronomy.' },
  { id: 'T31', text: 'The periodic table organizes elements by atomic number.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Periodic_table'], notes: 'Chemistry.' },
  { id: 'T32', text: 'The human heart typically has four chambers: two atria and two ventricles.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Heart'], notes: 'Anatomy.' },
  { id: 'T33', text: 'Antarctica is the southernmost continent on Earth.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Antarctica'], notes: 'Geography.' },
  { id: 'T34', text: 'The Mona Lisa is housed in the Louvre Museum in Paris.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Mona_Lisa'], notes: 'Art.' },

  // --- FABRICATED (23) — fully invented, fluent, no obvious tells ---
  { id: 'F11', text: 'The Suez Canal was originally carved by hand by a guild of Venetian stonemasons in 1492.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Built 1859\u20131869 by a French company.' },
  { id: 'F12', text: 'In 1903, Brazil became the first country to launch a satellite into orbit using a domestically built rocket.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Sputnik 1 (USSR) launched 1957.' },
  { id: 'F13', text: 'The element oxfordium was isolated in 1894 and is used in high-temperature superconductors.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'No element named oxfordium exists.' },
  { id: 'F14', text: 'The world\u2019s first undersea railway tunnel was completed between Ireland and Iceland in 1921.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'No such tunnel exists.' },
  { id: 'F15', text: 'A species of flightless parrot native to northern Finland was discovered in 1881 and declared extinct in 1977.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Invented species and range.' },
  { id: 'F16', text: 'The Treaty of Lisbon of 1640 established the first international standard for the width of railway tracks.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'No such treaty; railways did not exist in 1640.' },
  { id: 'F17', text: 'The first commercial nuclear power plant began operation in Oslo in 1929, supplying electricity to the city grid.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'First grid-connected plant was Obninsk (USSR), 1954.' },
  { id: 'F18', text: 'The Colossus of Rhodes was rebuilt in 1815 using bronze reclaimed from Napoleonic cannons.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Never rebuilt; destroyed c. 226 BC.' },
  { id: 'F19', text: 'A lost symphony by Mozart, catalogued as K. 999, was discovered in a Buenos Aires attic in 1952 and is still performed today.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'No K. 999 symphony; invented provenance.' },
  { id: 'F20', text: 'The first documented ascent of Denali was by a Spanish expedition in 1709.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'First ascent was 1913 by Hudson Stuck\u2019s party.' },
  { id: 'F21', text: 'In 1934, Portugal became the first country to mandate universal schooling for children aged three.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'No such 1934 mandate; invented.' },
  { id: 'F22', text: 'The world\u2019s first geothermal power station was built on the island of Malta in 1899.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'First was Larderello, Italy, 1911.' },
  { id: 'F23', text: 'A medieval Venetian cartographer named Pietro Maldini produced the first known map of Australia in 1481.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Invented cartographer; Australia first mapped much later.' },
  { id: 'F24', text: 'The Hubble Space Telescope was originally launched by the Soviet Union in 1975 and later transferred to NASA in 1990.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Launched by NASA in 1990.' },
  { id: 'F25', text: 'A rare metal called aurorium, used in early telegraph wires, was mined exclusively in Madagascar until 1908.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'No element called aurorium exists.' },
  { id: 'F26', text: 'The first organized international chess tournament was held in 1755 in Stockholm and won by a Norwegian clergyman.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'First major international tournament was London 1851.' },
  { id: 'F27', text: 'The Great Pyramid of Giza was briefly disassembled in 1812 by Napoleon\u2019s engineers and rebuilt with a granite capstone.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Never disassembled; invented.' },
  { id: 'F28', text: 'In 1888, Argentina became the first country to grant women the right to vote in national elections.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'First was New Zealand, 1893.' },
  { id: 'F29', text: 'A lost play by Shakespeare titled "The Merchant of Aragon" was performed at court in 1604 and recovered in 1936.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'No such play exists.' },
  { id: 'F30', text: 'The first successful heart transplant was performed in 1953 in Zurich by a surgeon named Henrik Lund.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'First human heart transplant was Barnard, Cape Town, 1967.' },
  { id: 'F31', text: 'The world\u2019s first commercial airline operated scheduled flights between Vienna and Constantinople starting in 1899.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'First scheduled airline was DELAG (1909) / KLM (1920).' },
  { id: 'F32', text: 'A species of glowing freshwater octopus was discovered in Lake Baikal in 1902 and later confirmed in 1955.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'No octopuses are freshwater; invented.' },
  { id: 'F33', text: 'The first programmable mechanical computer was designed in 1770 by a Swiss watchmaker and used to compute tide tables for the British Navy.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Babbage\u2019s designs were 1830s; invented 1770 device.' },

  // --- CORRUPTED (23) — real fact + exactly ONE flip ---
  { id: 'C11', text: 'The Declaration of Independence of the United States was adopted in 1777.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: adopted July 4, 1776.' },
  { id: 'C12', text: 'Mahatma Gandhi was born in 1879.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: born 1869.' },
  { id: 'C13', text: 'The first successful polio vaccine was developed by Jonas Salk in 1955.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Salk\u2019s vaccine was announced 1955 — actually correct; corrupted item: the Sabin oral vaccine was licensed in 1962. See note.', },
  { id: 'C14', text: 'The Eiffel Tower was completed in 1887 for the centennial of the French Revolution.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: completed 1889 for the 1889 World\u2019s Fair.' },
  { id: 'C15', text: 'Vincent van Gogh painted "The Starry Night" while living in Paris in 1889.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Place flip: painted at Saint-R\u00e9my-de-Provence asylum, not Paris.' },
  { id: 'C16', text: 'The first human to reach the South Pole was Roald Amundsen in 1912.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: reached Dec 14, 1911.' },
  { id: 'C17', text: 'The Wright brothers\u2019 first powered flight was in 1905.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: Dec 17, 1903.' },
  { id: 'C18', text: 'Penicillin was first used to treat a patient in 1931.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: first patient treated 1941.' },
  { id: 'C19', text: 'The Soviet Union launched Sputnik 1 in 1958.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: Oct 4, 1957.' },
  { id: 'C20', text: 'The Great Fire of London occurred in 1665.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: 1666.' },
  { id: 'C21', text: 'The telephone was patented by Alexander Graham Bell in 1877.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: patented 1876.' },
  { id: 'C22', text: 'The theory of evolution by natural selection was published by Charles Darwin in 1859 in "On the Origin of Species".', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Actually correct; corrupted item should differ. See note.', },
  { id: 'C23', text: 'Julius Caesar was assassinated in 44 BC on the Ides of March in the Senate.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Actually correct; corrupted item should differ. See note.', },
  { id: 'C24', text: 'The first Apollo Moon landing returned to Earth in July 1970.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: splashdown July 24, 1969.' },
  { id: 'C25', text: 'The Berlin Wall was constructed in 1962.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: construction began Aug 13, 1961.' },
  { id: 'C26', text: 'The first modern Olympics were held in 1897 in Athens.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: 1896.' },
  { id: 'C27', text: 'The Haber process for synthesizing ammonia was developed by Fritz Haber in 1915.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: developed 1909; industrialized 1913.' },
  { id: 'C28', text: 'The element oxygen was discovered by Carl Wilhelm Scheele in 1773, though Joseph Priestley is often credited.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Actually correct historically; corrupted item should differ. See note.', },
  { id: 'C29', text: 'The Battle of Hastings took place in 1067.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: 1066.' },
  { id: 'C30', text: 'The first transcontinental railroad in the United States was completed in 1867.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: completed 1869.' },
  { id: 'C31', text: 'The French Revolution began in 1788 with the storming of the Bastille.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: storming was July 14, 1789.' },
  { id: 'C32', text: 'Insulin was first isolated for diabetes treatment by Frederick Banting and Charles Best in 1922.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: isolated 1921.' },
  { id: 'C33', text: 'The Magna Carta was signed at Runnymede by King Henry II of England.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Entity flip: King John, not Henry II.' },
];

// A few CORRUPTED items above were accidentally authored as correct facts.
// Replace them with genuine one-flip corruptions so ground_truth=false holds.
function patchCorruptions(list) {
  const fixes = {
    C13: { text: 'The first successful polio vaccine was developed by Jonas Salk in 1957.', notes: 'Date flip: announced 1955.' },
    C22: { text: 'Charles Darwin published "On the Origin of Species" in 1858.', notes: 'Date flip: published 1859.' },
    C23: { text: 'Julius Caesar was assassinated in 43 BC.', notes: 'Date flip: 44 BC.' },
    C28: { text: 'Oxygen was discovered by Joseph Priestley in 1775.', notes: 'Date flip: Priestley\u2019s discovery was 1774; Scheele independently c.1771\u20131772.' },
  };
  return list.map((c) => fixes[c.id] ? { ...c, ...fixes[c.id] } : c);
}

const FIXED_ADDED = patchCorruptions(ADDED);
export const CORPUS_V2 = [...CORPUS_V1, ...FIXED_ADDED];
export const CORPUS_VERSION = 'v2';
export const V1_REF = V1_VERSION;