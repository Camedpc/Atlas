import asyncio, sys, wave, os, json
sys.path.insert(0, r"C:/Users/Camille/OneDrive/Camille/Knowledge/Stay hungry/Hackathon/Atlas")
from dotenv import load_dotenv
load_dotenv(r"C:/Users/Camille/OneDrive/Camille/Knowledge/Stay hungry/Hackathon/Atlas/.env")
os.environ["ATLAS_VOIX_TTS_VITESSE"] = "0"
from atlas.voix import gradium
L = json.load(open(sys.argv[1], encoding="utf-8"))
async def main():
    for nom, (t, v) in L.items():
        pcm = await gradium.synthetiser(t, v)
        with wave.open(nom + ".wav", "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000); w.writeframes(pcm)
asyncio.run(main())
