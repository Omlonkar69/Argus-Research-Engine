import React, { useState } from "react";
import { 
  auth, 
  handleFirestoreError, 
  OperationType,
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  getMultiFactorResolver,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier
} from "../lib/firebase";
import { Sparkles, Key, Mail, ShieldAlert, CheckCircle2, UserPlus, Lock, ShieldCheck, Smartphone, ArrowLeft, RefreshCw } from "lucide-react";

interface AuthPageProps {
  onAuthSuccess: (user: any) => void;
}

export default function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // SMS MFA Challenge specific states
  const [step, setStep] = useState<"SIGN_IN" | "MFA_CHALLENGE" | "GOOGLE_PROMPT">("SIGN_IN");
  const [googleEmail, setGoogleEmail] = useState("");
  const [mfaResolver, setMfaResolver] = useState<any>(null);
  const [mfaHints, setMfaHints] = useState<any[]>([]);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [isCodeSending, setIsCodeSending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const handleGoogleSignInClick = () => {
    setStep("GOOGLE_PROMPT");
    setError(null);
    setSuccess(null);
  };

  const handleGoogleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleEmail || !googleEmail.includes("@")) {
      setError("Please key in a valid Google Email address.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
      });
      const result = await signInWithPopup(auth, provider, googleEmail);
      if (result.user) {
        setSuccess(`Successfully authenticated ${result.user.email} via Google SSO!`);
        setTimeout(() => {
          onAuthSuccess(result.user);
        }, 1000);
      }
    } catch (err: any) {
      console.error("Google authentication error:", err);
      if (err.code === "auth/multi-factor-auth-required") {
        try {
          const resolver = getMultiFactorResolver(auth, err);
          setMfaResolver(resolver);
          setMfaHints(resolver.hints);
          setStep("MFA_CHALLENGE");
          setError(null);
          setSuccess("Account is protected by Multi-Factor Authentication. Please proceed to verify.");
        } catch (resErr: any) {
          setError("Failed to load multi-factor resolver: " + resErr.message);
        }
      } else {
        setError(err.message || "Google authentication failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill out all credentials.");
      return;
    }
    if (isSignUp && !fullName) {
      setError("Please provide your full name.");
      return;
    }
    if (password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isSignUp) {
        // Create user
        const result = await createUserWithEmailAndPassword(auth, email, password);
        if (result.user) {
          await updateProfile(result.user, {
            displayName: fullName
          });
          setSuccess("Account registered! Proceeding to setup your workspace...");
          setTimeout(() => {
            onAuthSuccess(result.user);
          }, 1000);
        }
      } else {
        // Sign-in user
        const result = await signInWithEmailAndPassword(auth, email, password);
        if (result.user) {
          onAuthSuccess(result.user);
        }
      }
    } catch (err: any) {
      console.error("Email auth error:", err);
      if (err.code === "auth/multi-factor-auth-required") {
        try {
          const resolver = getMultiFactorResolver(auth, err);
          setMfaResolver(resolver);
          setMfaHints(resolver.hints);
          setStep("MFA_CHALLENGE");
          setError(null);
          setSuccess("Account is protected by Multi-Factor Authentication. Please proceed to verify.");
        } catch (resErr: any) {
          setError("Failed to load multi-factor resolver: " + resErr.message);
        }
      } else if (err.code === "auth/email-already-in-use") {
        setError("This email address is already registered. Please sign in instead.");
      } else if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError("Invalid email or password combination. Check credentials.");
      } else if (err.code === "auth/user-not-found") {
        setError("No account was found matching this email. Sign up above!");
      } else if (err.code === "auth/operation-not-allowed") {
        setError("Email/Password signup is currently disabled in the Firebase Console. To enable it, navigate to Firebase Console -> Authentication -> Sign-in Method, and enable 'Email/Password'. Alternatively, please use the 'Continue with Gmail' button above, which works instantly!");
      } else {
        setError(err.message || "Authentication failed. Try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMfaCode = async () => {
    if (!mfaResolver || mfaHints.length === 0) {
      setError("MFA resolver is invalid. Please return and try signing in again.");
      return;
    }
    setError(null);
    setIsCodeSending(true);
    setSuccess(null);
    try {
      const verifier = new RecaptchaVerifier(auth, "mfa-recaptcha-container", {
        size: "invisible",
      });
      const selectedHint = mfaHints[0];
      const phoneAuthProvider = new PhoneAuthProvider(auth);
      const varId = await phoneAuthProvider.verifyPhoneNumber({
        multiFactorHint: selectedHint,
        session: mfaResolver.session,
      }, verifier);
      setVerificationId(varId);
      setCodeSent(true);
      setSuccess("Verification SMS dispatch successful to your registered phone number.");
    } catch (err: any) {
      console.error("MFA Code Dispatch Fail:", err);
      setError("MFA code request failed: " + (err.message || err));
    } finally {
      setIsCodeSending(false);
    }
  };

  const handleVerifyMfaCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationId || !verificationCode) {
      setError("Please input the 6-digit confirmation code.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const cred = PhoneAuthProvider.credential(verificationId, verificationCode);
      const assertion = PhoneMultiFactorGenerator.assertion(cred);
      const userCredential = await mfaResolver.resolveSignIn(assertion);
      if (userCredential.user) {
        onAuthSuccess(userCredential.user);
      }
    } catch (err: any) {
      console.error("MFA Verification error:", err);
      setError("Validation failed. The SMS code you entered is invalid or expired.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetChallenge = () => {
    setStep("SIGN_IN");
    setMfaResolver(null);
    setMfaHints([]);
    setVerificationCode("");
    setVerificationId(null);
    setCodeSent(false);
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-[#090B0F] text-gray-200 px-4 select-none relative">
      
      {/* Background visual graphics */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-950/20 via-[#090B0F] to-[#050608] pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent pointer-events-none" />
      
      {/* Invisible Recaptcha Mount Point */}
      <div id="mfa-recaptcha-container" className="hidden pointer-events-none"></div>

      <div className="w-full max-w-md bg-[#0D0F13] border border-[#2D3139] rounded-xl shadow-2xl overflow-hidden relative z-10 flex flex-col p-8 transition-transform duration-300">
        
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Head branding */}
        <div className="flex flex-col items-center text-center mt-2 mb-6">
          <div className="w-12 h-12 rounded-lg bg-cyan-950/40 border border-cyan-800/40 flex items-center justify-center mb-4 shadow-inner">
            <Sparkles className="w-6 h-6 text-[#38BDF8] animate-pulse" />
          </div>
          <h1 className="font-serif-editorial font-bold text-3xl text-white tracking-tight">
            Argus Research
          </h1>
          <p className="text-xs font-mono text-gray-400 mt-1 uppercase tracking-widest leading-relaxed">
            Decoupled Multi-Agent Engine
          </p>
        </div>

        {/* Error notification */}
        {error && (
          <div className="p-3.5 mb-5 bg-red-950/30 border border-red-800/20 rounded text-xs font-sans text-red-300 leading-relaxed flex items-start gap-2.5 z-10">
            <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success notification */}
        {success && (
          <div className="p-3.5 mb-5 bg-emerald-950/35 border border-emerald-800/20 rounded text-xs font-sans text-emerald-300 leading-relaxed flex items-start gap-2.5 z-10">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {step === "SIGN_IN" ? (
          <>
            {/* Real Dynamic Google Auth trigger for email/gmail users */}
            <button
              onClick={handleGoogleSignInClick}
              disabled={isLoading}
              id="google-signin-button"
              className="w-full py-3 px-4 rounded bg-[#16181D] hover:bg-[#202328] border border-[#2D3139] hover:border-cyan-500/50 text-white font-mono font-bold text-xs flex items-center justify-center gap-3 tracking-wider transition-all cursor-pointer shadow-md disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.68 1.54 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.85 2.99c.9-2.7 3.42-4.51 6.76-4.51z"
                />
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.44h6.46c-.28 1.48-1.12 2.74-2.38 3.58l3.69 2.86c2.16-1.99 3.42-4.92 3.42-8.54y"
                />
                <path
                  fill="#FBBC05"
                  d="M5.24 14.55c-.23-.69-.36-1.43-.36-2.2s.13-1.51.36-2.2L1.39 7.16C.5 8.93 0 10.91 0 13s.5 4.07 1.39 5.84l3.85-2.99z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.24 0 5.95-1.08 7.93-2.91l-3.69-2.86c-1.02.68-2.33 1.09-3.79 1.15c-3.34 0-5.86-1.81-6.76-4.51L1.39 16.85C3.37 20.33 7.35 23 12 23y"
                />
              </svg>
              CONTINUE WITH GMAIL
            </button>

            {/* Divider */}
            <div className="flex items-center my-6">
              <div className="flex-1 h-[1px] bg-[#2D3139]" />
              <span className="text-[9px] font-mono font-bold text-gray-500 uppercase px-3 tracking-widest">
                OR VERIFIED IDENTITY
              </span>
              <div className="flex-1 h-[1px] bg-[#2D3139]" />
            </div>

            {/* Verification Auth Form */}
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {isSignUp && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400 block font-bold">
                    Display Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={isLoading}
                      id="auth-fullname-input"
                      className="w-full pl-9 pr-4 py-2.5 bg-[#16181D]/40 border border-[#2D3139] rounded text-[13px] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-all font-sans"
                    />
                    <UserPlus className="absolute left-3 top-3.5 w-3.5 h-3.5 text-gray-500 whitespace-nowrap" />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400 block font-bold">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="address@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    id="auth-email-input"
                    className="w-full pl-9 pr-4 py-2.5 bg-[#16181D]/40 border border-[#2D3139] rounded text-[13px] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-all font-sans"
                  />
                  <Mail className="absolute left-3 top-3.5 w-3.5 h-3.5 text-gray-500 whitespace-nowrap" />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-gray-400 block font-bold">
                    Key Password
                  </label>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    id="auth-password-input"
                    className="w-full pl-9 pr-4 py-2.5 bg-[#16181D]/40 border border-[#2D3139] rounded text-[13px] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-all font-sans"
                  />
                  <Lock className="absolute left-3 top-3.5 w-3.5 h-3.5 text-gray-500 whitespace-nowrap" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                id="auth-submit-button"
                className="w-full mt-2 py-3 bg-cyan-600 hover:bg-cyan-500 text-black font-mono font-bold text-xs uppercase tracking-wider rounded transition-all cursor-pointer shadow-lg shadow-cyan-500/10 flex items-center justify-center gap-2"
              >
                {isSignUp ? <UserPlus className="w-4 h-4 fill-black text-black" /> : <Key className="w-4 h-4 fill-black text-black" />}
                {isSignUp ? "CREATE NEW WORKSPACE" : "UNLOCK ENGINE SECRETS"}
              </button>
            </form>

            {/* Toggle option */}
            <div className="text-center mt-6">
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
                disabled={isLoading}
                id="auth-toggle-button"
                className="text-[10px] font-mono text-[#38BDF8] hover:underline uppercase tracking-wider cursor-pointer"
              >
                {isSignUp ? "Already registered? Sign In" : "Need workspace account? Sign Up"}
              </button>
            </div>
          </>
        ) : step === "GOOGLE_PROMPT" ? (
          /* GOOGLE PROMPT PORTAL MODULE */
          <div className="space-y-5">
            <div className="space-y-2 border-b border-[#2D3139] pb-4 mb-3">
              <div className="flex items-center gap-2.5 text-cyan-400">
                <svg className="w-5 h-5 text-[#38BDF8]" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.24.6 4.44 1.59l2.44-2.44C17.24 1.54 14.89 1 12.24 1c-5.5 0-10 4.5-10 10s4.5 10 10 10c5.78 0 9.62-4.06 9.62-9.78 0-.66-.08-1.29-.22-1.93H12.24z"
                  />
                </svg>
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider">
                  GOOGLE SSO PORTAL
                </h2>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed font-sans mt-0.5">
                Authenticate with your Google email address to securely access Argus Research.
              </p>
            </div>

            <form onSubmit={handleGoogleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-widest text-[#38BDF8] block font-bold">
                  Google Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    placeholder="e.g. scientist@gmail.com"
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                    disabled={isLoading}
                    autoFocus
                    className="w-full pl-9 pr-4 py-2.5 bg-[#16181D]/40 border border-[#2D3139] rounded text-[13px] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition-all font-sans"
                  />
                  <Mail className="absolute left-3 top-3.5 w-3.5 h-3.5 text-gray-500 whitespace-nowrap" />
                </div>
              </div>

              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={isLoading || !googleEmail}
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-[#16181D] disabled:opacity-40 text-black font-mono font-bold text-xs uppercase tracking-wider rounded transition-all cursor-pointer flex items-center justify-center gap-2 min-h-[44px]"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                  ) : (
                    <>
                      <Lock className="w-4 h-4 text-black" />
                      SIGN IN WITH GOOGLE
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="pt-3 border-t border-[#2D3139]/50 flex items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  setStep("SIGN_IN");
                  setError(null);
                  setSuccess(null);
                }}
                className="text-xs font-mono text-gray-500 hover:text-white flex items-center gap-1.5 transition-all"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Cancel and return
              </button>
            </div>
          </div>
        ) : (
          /* MFA SECOND STEP VERIFICATION PANEL */
          <div className="space-y-5">
            <div className="space-y-2 border-b border-[#2D3139] pb-4 mb-3">
              <div className="flex items-center gap-2 text-cyan-400">
                <ShieldCheck className="w-5 h-5" />
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider">
                  2-STEP AUTH REQUIRED
                </h2>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed font-sans mt-1">
                Your workspace is secured with multi-factor authentication. SMS verification has been established for identity protection.
              </p>
              {mfaHints.length > 0 && (
                <div className="flex items-center gap-2 mt-2 bg-[#16181D] border border-[#2D3139] px-3 py-2 rounded text-xs font-mono text-gray-300">
                  <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    Phone: {mfaHints[0].phoneNumber || "Registered Device"}
                  </span>
                </div>
              )}
            </div>

            {!codeSent ? (
              <div className="space-y-4">
                <p className="text-[11px] font-mono text-gray-400 uppercase tracking-wide">
                  Click below to dispatch your unique 6-digit access code to this phone number.
                </p>
                <button
                  type="button"
                  onClick={handleSendMfaCode}
                  disabled={isCodeSending}
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-black font-mono font-bold text-xs uppercase tracking-wider rounded transition-all cursor-pointer flex items-center justify-center gap-2 min-h-[44px]"
                >
                  {isCodeSending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-black" />
                      SENDING CODE...
                    </>
                  ) : (
                    "DISPATCH VERIFICATION SMS"
                  )}
                </button>
              </div>
            ) : (
              <form onSubmit={handleVerifyMfaCode} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 block font-bold">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="e.g. 123456"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, ""))}
                    disabled={isLoading}
                    className="w-full text-center py-2.5 bg-[#16181D] border border-[#2D3139] rounded text-lg font-mono tracking-widest text-[#38BDF8] focus:outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>

                <div className="flex flex-col gap-2.5 pt-2">
                  <button
                    type="submit"
                    disabled={isLoading || verificationCode.length < 6}
                    className="w-full py-3 bg-[#38BDF8] hover:bg-[#0EA5E9] disabled:bg-[#16181D] disabled:opacity-40 text-black font-mono font-bold text-xs uppercase tracking-wider rounded transition-all cursor-pointer flex items-center justify-center gap-2 min-h-[44px]"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    ) : (
                      <Key className="w-4 h-4" />
                    )}
                    VERIFY IDENTITY & SUBMIT
                  </button>

                  <button
                    type="button"
                    onClick={handleSendMfaCode}
                    disabled={isCodeSending}
                    className="text-[10px] font-mono text-gray-400 hover:text-cyan-400 underline uppercase tracking-wider"
                  >
                    Resend SMS Code
                  </button>
                </div>
              </form>
            )}

            {/* Exit/Cancel Action */}
            <div className="pt-3 border-t border-[#2D3139]/50 flex items-center justify-center">
              <button
                type="button"
                onClick={handleResetChallenge}
                className="text-xs font-mono text-gray-500 hover:text-white flex items-center gap-1.5 transition-all"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Cancel and return
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
