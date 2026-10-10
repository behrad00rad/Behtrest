import { useEffect, useRef, useState } from "react";
import { request, type User } from "./api";
import { ErrorNotice } from "./components";

type Scan = {
  id: number;
  status: string;
  message: string;
  preview: string;
  user: User;
};

export function ImageCheck({
  id,
  picture = false,
  approved,
}: {
  id: number;
  picture?: boolean;
  approved: (user: User) => void;
}) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState("");
  const [appealed, setAppealed] = useState(false);
  const callback = useRef(approved);
  callback.current = approved;
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await request<Scan>(
          `/image-scans/${id}/`,
          "GET",
          undefined,
          true,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setScan(value);
        setError("");
        if (value.status === "approved") {
          callback.current(value.user);
          return;
        }
        if (value.status === "canceled") return;
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(
          e instanceof Error ? e.message : "Could not check image status.",
        );
      }
      timer = setTimeout(() => void poll(), 3000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id]);
  async function appeal() {
    setError("");
    try {
      await request(`/image-scans/${id}/appeal/`, "POST", {});
      setAppealed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not request review.");
    }
  }
  return (
    <div className="image-check" role="status">
      {picture &&
        scan &&
        scan.status !== "approved" &&
        scan.status !== "canceled" && (
          <img
            src={scan.preview}
            alt="Your pending profile picture"
            width={80}
            height={80}
          />
        )}
      <p>
        {scan?.message || "Processing your image. Only you can see it for now."}
      </p>
      {scan?.status === "rejected" && (
        <button
          type="button"
          className="secondary-button"
          disabled={appealed}
          onClick={() => void appeal()}
        >
          {appealed ? "Review requested" : "Request review"}
        </button>
      )}
      <ErrorNotice error={error} />
    </div>
  );
}
