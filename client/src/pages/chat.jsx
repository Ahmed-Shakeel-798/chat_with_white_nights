import { useEffect } from "react";
import { useParams } from "react-router-dom";

export default function Chat() {
  const { id } = useParams();

  useEffect(() => {
    const evt = new EventSource(`http://localhost:8000/stream/${id}`);

    evt.onmessage = (e) => {
      console.log("SSE:", e.data);
    };

    return () => evt.close();
  }, [id]);

  return (
    <div>
      <h2>Chat #{id}</h2>
      <p>SSE connected. Check console.</p>
    </div>
  );
}
