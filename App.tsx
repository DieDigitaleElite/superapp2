
import React, { useState, useCallback, useEffect } from 'react';
import { Product, TryOnState } from './types';
import { MOCK_PRODUCTS, AVAILABLE_SIZES } from './constants';
import { performVirtualTryOn, fileToBase64, urlToBase64, estimateSizeFromImage } from './services/geminiService';
import ProductCard from './components/ProductCard';
import StepIndicator from './components/StepIndicator';

const App: React.FC = () => {
  const [state, setState] = useState<TryOnState>({
    userImage: null,
    selectedProduct: null,
    resultImage: null,
    recommendedSize: null,
    isLoading: false,
    error: null,
  });

  const [step, setStep] = useState(1);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  // Initialer Check auf Key (für Vercel/External Hosting wichtig)
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        setHasKey(true); // Fallback für lokale Entwicklung
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasKey(true); // Race Condition vorbeugen: Wir nehmen Erfolg an
    }
  };

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        setState(prev => ({ ...prev, userImage: base64, error: null }));
      } catch (err) {
        setState(prev => ({ ...prev, error: "Fehler beim Lesen der Datei." }));
      }
    }
  }, []);

  const handleTryOn = async () => {
    if (!state.userImage || !state.selectedProduct) return;
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    setStep(3);

    try {
      const productBase64 = await urlToBase64(state.selectedProduct.imageUrl);
      
      // Sequentiell aufrufen
      const size = await estimateSizeFromImage(state.userImage, state.selectedProduct.name);
      const image = await performVirtualTryOn(state.userImage, productBase64, state.selectedProduct.name);
      
      setState(prev => ({ ...prev, resultImage: image, recommendedSize: size, isLoading: false }));
    } catch (err: any) {
      console.error("Critical Error:", err);
      const msg = err.message || "";
      
      // Wenn der Key abgelehnt wird (Error 400), zurück zur Key-Auswahl
      if (msg.includes("400") || msg.includes("INVALID_KEY") || msg.includes("key")) {
        setHasKey(false);
        setState(prev => ({ ...prev, isLoading: false, error: "API-Key wurde abgelehnt. Bitte wähle einen Key mit Billing/Abrechnung." }));
      } else {
        setState(prev => ({ ...prev, isLoading: false, error: "Fehler: Die KI konnte das Bild nicht generieren. Bitte versuche ein anderes Foto." }));
      }
    }
  };

  const reset = () => {
    setState({ userImage: null, selectedProduct: null, resultImage: null, recommendedSize: null, isLoading: false, error: null });
    setStep(1);
  };

  // Splash Screen für Key Auswahl (Wichtig für Vercel Hosting)
  if (hasKey === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-[40px] p-10 shadow-2xl text-center border border-indigo-50">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl rotate-3">
            <span className="text-white font-black text-3xl">B</span>
          </div>
          <h1 className="text-2xl font-black mb-4 uppercase tracking-tighter italic text-slate-800">API Key benötigt</h1>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed">
            Auf Vercel musst du einen eigenen <b>Gemini API Key</b> aus einem Google Cloud Projekt mit <b>aktivierter Abrechnung</b> nutzen.
          </p>
          <button onClick={handleSelectKey} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-lg active:scale-95 uppercase italic tracking-tighter">Key jetzt auswählen</button>
          <p className="mt-6 text-[10px] text-slate-400 uppercase tracking-widest font-bold">Details unter: <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline">ai.google.dev/billing</a></p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-slate-50">
      <header className="bg-white border-b border-gray-100 py-4 mb-8 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <span className="font-bold text-xl tracking-tight uppercase italic">Better Future <span className="font-light text-gray-400 not-italic">Collection</span></span>
          </div>
          <button onClick={reset} className="text-[10px] font-black text-gray-400 hover:text-indigo-600 uppercase tracking-[0.2em] transition-colors">Reset</button>
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-5xl">
        <StepIndicator currentStep={step} />

        {step === 1 && (
          <div className="animate-fadeIn">
            <div className="text-center mb-10">
              <h1 className="text-4xl font-black text-slate-900 italic uppercase tracking-tighter">Wähle deinen Look</h1>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
              {MOCK_PRODUCTS.map(p => (
                <ProductCard key={p.id} product={p} isSelected={state.selectedProduct?.id === p.id} onSelect={(prod) => setState(prev => ({...prev, selectedProduct: prod}))} />
              ))}
            </div>
            <div className="flex justify-center">
              <button disabled={!state.selectedProduct} onClick={() => setStep(2)} className={`px-16 py-5 rounded-full font-black text-xl transition-all shadow-xl ${state.selectedProduct ? 'bg-indigo-600 text-white hover:-translate-y-1' : 'bg-gray-200 text-gray-400'}`}>WEITER</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fadeIn max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-black uppercase italic">Foto hochladen</h1>
            </div>
            <div className="bg-white p-8 rounded-[40px] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center min-h-[400px] shadow-2xl">
              {state.userImage ? (
                <div className="relative">
                  <img src={state.userImage} alt="Vorschau" className="rounded-3xl shadow-2xl w-full max-h-[500px] object-cover border-8 border-white" />
                  <button onClick={() => setState(prev => ({ ...prev, userImage: null }))} className="absolute -top-4 -right-4 bg-red-500 text-white p-3 rounded-full shadow-xl">X</button>
                </div>
              ) : (
                <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer py-10">
                  <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6 text-indigo-600">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                  </div>
                  <p className="text-slate-400 font-black uppercase tracking-widest text-sm">Bild auswählen</p>
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                </label>
              )}
            </div>
            <div className="flex gap-4 mt-10 justify-center">
              <button onClick={() => setStep(1)} className="px-10 py-4 rounded-full font-black text-slate-400 bg-white border border-slate-100 uppercase text-xs">Zurück</button>
              <button disabled={!state.userImage} onClick={handleTryOn} className={`px-12 py-4 rounded-full font-black text-lg shadow-xl ${state.userImage ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-200 text-gray-400'}`}>ANPROBE STARTEN ✨</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-fadeIn">
            {state.isLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-24 h-24 border-8 border-indigo-50 border-t-indigo-600 rounded-full animate-spin mb-10"></div>
                <h2 className="text-3xl font-black text-indigo-600 italic uppercase tracking-tighter animate-pulse">Look wird generiert...</h2>
              </div>
            ) : state.error ? (
              <div className="bg-white border-2 border-red-50 rounded-[40px] p-12 text-center max-w-xl mx-auto shadow-2xl">
                <h2 className="text-2xl font-black mb-6 uppercase italic text-red-600">Fehler</h2>
                <p className="text-slate-600 font-bold mb-10">{state.error}</p>
                <button onClick={() => setStep(2)} className="px-12 py-4 bg-indigo-600 text-white rounded-full font-black uppercase shadow-lg">Nochmal versuchen</button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-12 items-start">
                <img src={state.resultImage!} className="w-full rounded-[40px] shadow-2xl border-4 border-white" />
                <div className="bg-white p-10 rounded-[50px] shadow-2xl border border-slate-50">
                  <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-8 leading-none">{state.selectedProduct?.name}</h2>
                  <div className="bg-emerald-50 rounded-[30px] p-6 mb-10 flex items-center space-x-6 border border-emerald-100">
                    <div className="bg-emerald-600 text-white w-20 h-20 rounded-2xl flex items-center justify-center text-4xl font-black">{state.recommendedSize}</div>
                    <div>
                      <p className="font-black text-emerald-900 text-xl uppercase italic tracking-tighter">Empfehlung</p>
                      <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">KI Analyse aktiv</p>
                    </div>
                  </div>
                  <button onClick={() => window.open('https://superbeautiful.de', '_blank')} className="w-full bg-indigo-600 text-white py-6 rounded-full font-black text-2xl uppercase tracking-widest shadow-xl">ZUM SHOP</button>
                  <button onClick={reset} className="w-full mt-6 text-slate-400 font-black uppercase text-[10px] tracking-widest italic hover:text-indigo-600">Neustart</button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
