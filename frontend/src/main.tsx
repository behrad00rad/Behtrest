import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth";
import App from "./App";
import { ChatProvider } from "./ChatContext";
import "./styles.css";
import "./messenger.css";
import "./product.css";
import "./community.css";
import "./minimal.css";
import "./layout.css";
import "./discover.css";
import "./owl-motion.css";
import "./pins.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ChatProvider>
          <App />
        </ChatProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
import "./profile.css";
import "./words.css";
