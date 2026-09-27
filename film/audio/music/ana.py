import librosa, numpy as np, glob, sys
for f in sorted(glob.glob('*.mp3')):
    y, sr = librosa.load(f, sr=22050, mono=True)
    t, beats = librosa.beat.beat_track(y=y, sr=sr)
    rms = librosa.feature.rms(y=y, hop_length=sr)[0]  # per second
    rmsdb = 20*np.log10(rms+1e-6)
    cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=sr)[0]
    # 10s blocks energy profile
    blocks = [round(float(np.mean(rmsdb[i:i+10])),0) for i in range(0,len(rmsdb),10)]
    print(f, 'dur %.0fs'%(len(y)/sr), 'bpm', np.round(t,1), 'centroid %.0f'%np.mean(cent))
    print('   dB/10s', blocks)
