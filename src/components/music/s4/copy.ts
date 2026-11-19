/**
 * s4 sketches: the words. Rough copy, true to what is known about him (guitar and bass, not very well;
 * beats in his spare time, in FL Studio, on an Akai MPK Mini). Final copy goes through humanizer.
 */
export const s4Copy = {
  name: 'Nicolás Muñoz García',
  whiteLabel: {
    eyebrow: 'Not on vinyl',
    headline: 'One of mine.',
    // To confirm with him: that he has no record of his own out.
    lede: 'I don’t have a record out. If I did, it would be a white label, like this one.',
    hintSealed: 'Slide to unwrap',
    hintIn: 'Tap the sleeve to take it out',
    hintOut: 'Turn it over',
    sideA: { side: 'A', title: 'Beats', line: 'I make them in my spare time, in FL Studio, on an Akai MPK Mini.' },
    sideB: { side: 'B', title: 'Guitar and bass', line: 'I play both. Not very well.' },
  },
  ring: {
    eyebrow: 'From above',
    headline: 'The same eleven.',
    beats: 'In my spare time I make beats, in FL Studio, on an Akai MPK Mini.',
    play: 'I also play guitar and bass. Not very well.',
    hint: 'Turn them',
  },
  hours: {
    eyebrow: 'After hours',
    headline: 'Where I make them.',
    beats: 'In my spare time I make beats, in FL Studio, on an Akai MPK Mini.',
    play: 'I play guitar and bass too. Not very well.',
    standIn: 'Stand-in. A photograph of my desk at night, lit only by the screen with FL Studio open.',
  },
} as const;
