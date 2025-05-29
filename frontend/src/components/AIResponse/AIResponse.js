import { useState } from "react";

const AIResponse = ({ suggestion }) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  let speech = new SpeechSynthesisUtterance(suggestion);

  const toggleSpeech = () => {
    if (!suggestion) return;

    if (isSpeaking) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      speech = new SpeechSynthesisUtterance(suggestion);
      speech.lang = "en-US";
      speech.rate = 1;
      speech.pitch = 1;
      speech.onend = () => setIsSpeaking(false); // Reset state when speech ends
      speechSynthesis.speak(speech);
      setIsSpeaking(true);
    }
  };

  return (
    <div>
      <p>{suggestion}</p>
      <button onClick={toggleSpeech}>
        {isSpeaking ? "🛑 Stop" : "🔊 Listen"}
      </button>
    </div>
  );
};

export default AIResponse;
