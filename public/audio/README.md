# Audio

- `feather.m4a`: "Feather" by Nujabes (Modal Soul, 2005), from the owner's own FLAC, with a needle drop mixed onto its start. AAC 160 kbps, 44.1 kHz, 177.45 s.
- The needle drop is "Record Player Needle is dropped & Vinyl crackling" by Breviceps, CC0 (public domain): https://freesound.org/people/Breviceps/sounds/556722/ (its 128 kbps HQ preview).
- `modal-soul.jpg`: the album cover, 192 px.

Rebuild `feather.m4a` (needle 7 dB down, trimmed 50 ms and faded out from 4.8 s over 1.8 s; the song comes in at 0.95 s):

```bash
ffmpeg -i needle-hq.mp3 -i "01 - Feather - Nujabes.flac" -filter_complex "[0:a]atrim=start=0.05,asetpts=PTS-STARTPTS,aresample=44100,volume=-7dB,afade=t=out:st=4.8:d=1.8[n];[1:a]aresample=44100,adelay=950|950[s];[n][s]amix=inputs=2:duration=longest:normalize=0[out]" -map "[out]" -map_metadata -1 -c:a aac -b:a 160k -movflags +faststart feather.m4a
```
