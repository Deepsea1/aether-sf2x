// Gate 0 corpus — versioned, human-locked ground truth.
// 30 claims: 10 TRUE, 10 FABRICATED (fully invented, fluent, no tells),
// 10 CORRUPTED (real fact + exactly ONE flip: date, entity, or polarity).
// Never edit a claim after a run has scored against it — append a new version.
// Ground truth is labeled by construction. Sources are real URLs for TRUE
// claims (strong primary sourcing); FABRICATED/CORRUPTED carry no supporting
// source (a contradicting source is noted in `notes` where useful).

export const CORPUS_V1 = [
  // --- TRUE (10) — verifiable, strong primary sourcing ---
  { id: 'T01', text: 'Water boils at 100 degrees Celsius at standard atmospheric pressure of 1 atmosphere.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Boiling_point'], notes: 'Physics constant.' },
  { id: 'T02', text: 'The speed of light in a vacuum is approximately 299,792 kilometers per second.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Speed_of_light'], notes: 'Measured constant.' },
  { id: 'T03', text: 'Neil Armstrong was the first human to walk on the Moon, on July 20, 1969.', class: 'TRUE', ground_truth: true, sources: ['https://www.nasa.gov/mission/apollo-11/'], notes: 'Apollo 11.' },
  { id: 'T04', text: 'The chemical symbol for gold is Au, derived from the Latin word aurum.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Gold'], notes: 'Etymology.' },
  { id: 'T05', text: 'Mount Everest is the highest mountain above sea level on Earth.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Mount_Everest'], notes: 'Geography.' },
  { id: 'T06', text: 'The Pacific Ocean is the largest of Earth\u2019s oceanic divisions.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Pacific_Ocean'], notes: 'Geography.' },
  { id: 'T07', text: 'The double-helix structure of DNA was published by Watson and Crick in 1953.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Nucleic_acid_double_helix'], notes: 'Molecular biology.' },
  { id: 'T08', text: 'Earth orbits the Sun, completing one orbit approximately every 365.25 days.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Earth%27s_orbit'], notes: 'Astronomy.' },
  { id: 'T09', text: 'The Titanic sank in 1912 after striking an iceberg on its maiden voyage.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Sinking_of_the_Titanic'], notes: 'History.' },
  { id: 'T10', text: 'Humans have 23 pairs of chromosomes in each somatic cell.', class: 'TRUE', ground_truth: true, sources: ['https://en.wikipedia.org/wiki/Chromosome'], notes: 'Genetics.' },

  // --- FABRICATED (10) — fully invented, plausible, no obvious tells ---
  { id: 'F01', text: 'The Eiffel Tower was originally constructed in London in 1887, then dismantled and rebuilt in Paris in 1889 for the World\u2019s Fair.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Invented London origin; built in Paris 1887\u20131889.' },
  { id: 'F02', text: 'Australia was the first country to successfully land an uncrewed spacecraft on the surface of Mars, in 1976.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'No Australian Mars lander; USSR Mars 3 soft-landed 1971.' },
  { id: 'F03', text: 'The Great Library of Alexandria was destroyed in 642 AD by the Mongol army under Genghis Khan.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Era conflation; Genghis born 1162.' },
  { id: 'F04', text: 'In 1971, Norway became the first country to ban the internal combustion engine nationwide.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'No such ban; Norway still sells ICE vehicles.' },
  { id: 'F05', text: 'The world\u2019s first commercial wind farm was built in the Sahara Desert in 1938.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'First modern wind farm was US 1980 (New Hampshire).' },
  { id: 'F06', text: 'The Mona Lisa was painted in 1510 by a collective of Florentine monks known as the Bottega del Gigante.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'Painted by Leonardo da Vinci c.1503\u20131519.' },
  { id: 'F07', text: 'The Treaty of Kyoto, signed in 1603, established the first international agreement on maritime trade routes.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'No such treaty.' },
  { id: 'F08', text: 'The first transatlantic telephone cable was laid in 1901 by a joint Portuguese-Brazilian consortium.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'TAT-1 laid 1956 by UK/US/Canada.' },
  { id: 'F09', text: 'Mount Kilimanjaro was first summited in 1848 by a Dutch expedition led by Jan van Riebeeck.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'First ascent 1889 by Hans Meyer & Ludwig Purtscheller.' },
  { id: 'F10', text: 'The element berzelium was discovered in 1879 and is widely used in modern semiconductors.', class: 'FABRICATED', ground_truth: false, sources: [], notes: 'No element named berzelium exists.' },

  // --- CORRUPTED (10) — real fact + exactly ONE flip ---
  { id: 'C01', text: 'Abraham Lincoln was the 16th U.S. President and was assassinated in 1901.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: assassinated 1865, not 1901.' },
  { id: 'C02', text: 'World War II ended in 1946 when Japan formally signed the peace treaty with the Allied powers.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: ended 1945.' },
  { id: 'C03', text: 'The Magna Carta was sealed by King John of England in the year 1216.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: 1215.' },
  { id: 'C04', text: 'Penicillin was discovered by Alexander Fleming in 1929.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: 1928.' },
  { id: 'C05', text: 'The Berlin Wall fell in November 1990, leading to the reunification of Germany.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Date flip: fell 1989; reunification Oct 1990.' },
  { id: 'C06', text: 'The general theory of relativity was published by Isaac Newton in 1915.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Entity flip: Einstein, not Newton.' },
  { id: 'C07', text: 'The telephone was invented by Thomas Edison in 1876.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Entity flip: Alexander Graham Bell.' },
  { id: 'C08', text: 'The double-helix structure of DNA was discovered by Albert Einstein and Rosalind Franklin in 1953.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Entity flip: Watson & Crick, not Einstein.' },
  { id: 'C09', text: 'Vaccines cause autism; the 1998 study linking them was retracted but the link was later confirmed.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Polarity flip: vaccines do NOT cause autism.' },
  { id: 'C10', text: 'Antibiotics are effective against viral infections such as the common cold.', class: 'CORRUPTED', ground_truth: false, sources: [], notes: 'Polarity flip: antibiotics are ineffective against viruses.' },
];

export const CORPUS_VERSION = 'v1';