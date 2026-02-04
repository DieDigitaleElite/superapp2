
import { GoogleGenAI } from "@google/genai";
import { APP_CONFIG } from "../constants";

async function optimizeImage(base64: string, maxWidth = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
      } else {
        if (height > maxWidth) { width *= maxWidth / height; height = maxWidth; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error("Canvas failure"));
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error("Bildverarbeitung fehlgeschlagen."));
  });
}

function getCleanBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "");
}

// Erstellt IMMER eine neue Instanz, um den aktuellsten Key aus dem Dialog zu nutzen
function getAI() {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined") {
    throw new Error("INVALID_KEY");
  }
  return new GoogleGenAI({ apiKey });
}

export async function estimateSizeFromImage(userBase64: string, productName: string): Promise<string> {
  const optimized = await optimizeImage(userBase64, 800);
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: APP_CONFIG.TEXT_MODEL,
    contents: {
      parts: [
        { inlineData: { data: getCleanBase64(optimized), mimeType: "image/jpeg" } },
        { text: `Analyze the person's body type and suggest a clothing size (XS, S, M, L, XL, XXL) for "${productName}". Return ONLY the size code.` },
      ],
    },
  });
  const size = response.text?.trim().toUpperCase() || 'M';
  const valid = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  return valid.find(s => size.includes(s)) || 'M';
}

export async function performVirtualTryOn(userBase64: string, productBase64: string, productName: string): Promise<string> {
  const [optUser, optProduct] = await Promise.all([
    optimizeImage(userBase64, 1024),
    optimizeImage(productBase64, 1024)
  ]);

  const ai = getAI();
  
  // Spezieller Prompt für gemini-3-pro-image-preview
  const response = await ai.models.generateContent({
    model: APP_CONFIG.IMAGE_MODEL,
    contents: {
      parts: [
        { inlineData: { data: getCleanBase64(optUser), mimeType: "image/jpeg" } },
        { inlineData: { data: getCleanBase64(optProduct), mimeType: "image/jpeg" } },
        { text: `Virtual Try-On: Dress the person in IMAGE 1 with the exact clothing set from IMAGE 2 (${productName}). The person's identity, face, and background must remain exactly the same. Only change the clothing.` },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "3:4"
      }
    }
  });

  if (response.candidates?.[0]?.finishReason === 'SAFETY') {
    throw new Error("SAFETY_BLOCK");
  }

  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (part?.inlineData?.data) {
    return `data:image/jpeg;base64,${part.inlineData.data}`;
  }

  throw new Error("NO_IMAGE_GENERATED");
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
}

export async function urlToBase64(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.drawImage(img, 0, 0); resolve(canvas.toDataURL('image/jpeg', 0.9)); }
    };
    img.onerror = () => reject(new Error("Produktbild-Ladefehler"));
    img.src = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=1024&output=jpg`;
  });
}
