// Fully Decoupled client-side Firebase Auth & Firestore Bridge Engine
// Connects UI authentication state and researches list to Express server endpoints.

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error("Firestore Bridge Operation Error: ", JSON.stringify(errInfo));
}

// -------------------------------------------------------------
// CLIENT AUTH STATE & SESSION BRIDGE
// -------------------------------------------------------------

// Clear session token on module load to guarantee the login page is always displayed first on launch/refresh
localStorage.removeItem("argus_auth_token");

let currentInMemoryUser: any = null;
const authListeners = new Set<(user: any) => void>();

export const auth = {
  get currentUser() {
    return currentInMemoryUser;
  },
  async signOut() {
    localStorage.removeItem("argus_auth_token");
    currentInMemoryUser = null;
    reportsCache = [];
    notifyAuthListeners();
    triggerSnapshotListeners();
  }
};

function notifyAuthListeners() {
  authListeners.forEach((listener) => {
    try {
      listener(currentInMemoryUser);
    } catch (e) {
      console.error("Auth listener dispatch failed:", e);
    }
  });
}

export function onAuthStateChanged(authInstance: any, callback: (user: any) => void) {
  authListeners.add(callback);
  
  const token = localStorage.getItem("argus_auth_token");
  if (token) {
    fetch("/api/auth/me", {
      headers: { "Authorization": `Bearer ${token}` }
    })
    .then((res) => {
      if (!res.ok) throw new Error("Session expired or invalid");
      return res.json();
    })
    .then((data) => {
      currentInMemoryUser = data.user;
      callback(currentInMemoryUser);
      fetchReportsFromServer();
    })
    .catch((err) => {
      console.warn("Auto-login failed:", err.message);
      localStorage.removeItem("argus_auth_token");
      currentInMemoryUser = null;
      callback(null);
    });
  } else {
    setTimeout(() => {
      callback(null);
    }, 0);
  }

  return () => {
    authListeners.delete(callback);
  };
}

export class GoogleAuthProvider {
  static PROVIDER_ID = "google.com";
  customParams: any = {};
  setCustomParameters(params: any) {
    this.customParams = params;
  }
}

export async function signInWithPopup(authInstance: any, provider: any, customEmail?: string) {
  const emailToUse = (customEmail && customEmail.includes("@")) ? customEmail.trim() : "scholar.argus@gmail.com";
  
  const res = await fetch("/api/auth/google-sso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailToUse })
  });
  
  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.error || "SSO Login failed");
    if (data.mfaRequired) {
      error.code = "auth/multi-factor-auth-required";
      error.resolver = createMfaResolver(data);
    } else {
      error.code = "auth/invalid-credential";
    }
    throw error;
  }
  
  localStorage.setItem("argus_auth_token", data.token);
  currentInMemoryUser = data.user;
  notifyAuthListeners();
  await fetchReportsFromServer();
  
  return { user: data.user };
}

export async function signInWithEmailAndPassword(authInstance: any, email: string, pass: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass })
  });
  
  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.error || "Login failed");
    if (data.mfaRequired) {
      error.code = "auth/multi-factor-auth-required";
      error.resolver = createMfaResolver(data);
    } else {
      error.code = "auth/invalid-credential";
    }
    throw error;
  }
  
  localStorage.setItem("argus_auth_token", data.token);
  currentInMemoryUser = data.user;
  notifyAuthListeners();
  await fetchReportsFromServer();
  
  return { user: data.user };
}

export async function createUserWithEmailAndPassword(authInstance: any, email: string, pass: string) {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass })
  });
  
  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.error || "Registration failed");
    error.code = "auth/email-already-in-use";
    throw error;
  }
  
  localStorage.setItem("argus_auth_token", data.token);
  currentInMemoryUser = data.user;
  notifyAuthListeners();
  await fetchReportsFromServer();
  
  return { user: data.user };
}

export async function updateProfile(user: any, updates: { displayName?: string }) {
  const token = localStorage.getItem("argus_auth_token");
  if (!token) return;
  
  const res = await fetch("/api/auth/update-profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(updates)
  });
  
  if (res.ok && currentInMemoryUser) {
    currentInMemoryUser.displayName = updates.displayName;
    notifyAuthListeners();
  }
}

// -------------------------------------------------------------
// PHONE / MULTI-FACTOR AUTHENTICATION BRIDGE
// -------------------------------------------------------------

let lastPhoneSent = "";

export class RecaptchaVerifier {
  constructor(auth: any, elementId: string, options: any) {
    console.log("Invisible Recaptcha Configured for API MFA dispatch.");
  }
}

export class PhoneAuthProvider {
  constructor(authInstance: any) {}

  static PROVIDER_ID = "phone";

  static credential(verificationId: string, verificationCode: string) {
    return { verificationId, verificationCode };
  }

  async verifyPhoneNumber(options: any, verifier: any): Promise<string> {
    const token = localStorage.getItem("argus_auth_token");
    const payload: any = {};
    if (options.phoneNumber) {
      payload.phoneNumber = options.phoneNumber;
      lastPhoneSent = options.phoneNumber;
    } else if (options.session?.resolverToken) {
      payload.resolverToken = options.session.resolverToken;
    }
    
    const headers: any = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    const res = await fetch("/api/auth/mfa/send-code", {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to dispatch SMS code");
    return data.resolverToken;
  }
}

export class PhoneMultiFactorGenerator {
  static assertion(credential: any) {
    return {
      factorId: "phone",
      credential
    };
  }
}

function createMfaResolver(data: any) {
  return {
    hints: data.hints || [],
    session: { resolverToken: data.resolverToken },
    resolveSignIn: async (assertion: any) => {
      const res = await fetch("/api/auth/mfa/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolverToken: assertion.credential.verificationId,
          code: assertion.credential.verificationCode
        })
      });
      const verifyData = await res.json();
      if (!res.ok) throw new Error(verifyData.error || "MFA validation failed");
      
      localStorage.setItem("argus_auth_token", verifyData.token);
      currentInMemoryUser = verifyData.user;
      notifyAuthListeners();
      await fetchReportsFromServer();
      return { user: verifyData.user };
    }
  };
}

export function getMultiFactorResolver(authInstance: any, error: any) {
  return error.resolver;
}

export function multiFactor(user: any) {
  return {
    enrolledFactors: user?.enrolledFactors || [],
    getSession: async () => ({ token: "session-auth-token-holder" }),
    enroll: async (assertion: any, factorDisplayName: string) => {
      const token = localStorage.getItem("argus_auth_token");
      if (!token) throw new Error("Unauthorized");
      
      // Verify Code first
      const verifyRes = await fetch("/api/auth/mfa/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolverToken: assertion.credential.verificationId,
          code: assertion.credential.verificationCode
        })
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || "SMS pin verification failed");
      
      // Save Enrollment
      const enrollRes = await fetch("/api/auth/mfa/enroll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          phoneNumber: lastPhoneSent,
          displayName: factorDisplayName
        })
      });
      const enrollData = await enrollRes.json();
      if (!enrollRes.ok) throw new Error(enrollData.error || "SMS Enrollment failed");
      
      if (currentInMemoryUser) {
        currentInMemoryUser.enrolledFactors = enrollData.enrolledFactors;
        notifyAuthListeners();
      }
    },
    unenroll: async (factorInfo: any) => {
      const token = localStorage.getItem("argus_auth_token");
      if (!token) throw new Error("Unauthorized");
      
      const res = await fetch("/api/auth/mfa/unenroll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ factorUid: factorInfo.uid })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Disabling MFA failed");
      
      if (currentInMemoryUser) {
        currentInMemoryUser.enrolledFactors = data.enrolledFactors;
        notifyAuthListeners();
      }
    }
  };
}

// -------------------------------------------------------------
// FIRESTORE DATABASE SYNCRONIZATION BRIDGE
// -------------------------------------------------------------

export const db = { firestoreDatabaseId: "server-synced" };
let reportsCache: any[] = [];
const snapshotListeners = new Set<(snapshot: any) => void>();

function triggerSnapshotListeners() {
  const snapshot = {
    docs: reportsCache.map((doc) => ({
      data: () => doc,
    })),
    forEach(callback: (doc: any) => void) {
      reportsCache.map((doc) => ({
        data: () => doc,
      })).forEach(callback);
    },
  };
  snapshotListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (e) {
      console.error("Snapshot dispatch failed:", e);
    }
  });
}

export async function fetchReportsFromServer() {
  const token = localStorage.getItem("argus_auth_token");
  if (!token) return;
  try {
    const res = await fetch("/api/reports", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (res.ok) {
      reportsCache = await res.json();
      triggerSnapshotListeners();
    }
  } catch (err) {
    console.error("Could not fetch reports from server database:", err);
  }
}

export function collection(dbInstance: any, ...segments: string[]) {
  return {
    type: "collection",
    path: segments.join("/"),
  };
}

export function doc(dbInstance: any, ...segments: string[]) {
  return {
    type: "doc",
    path: segments.join("/"),
    id: segments[segments.length - 1],
  };
}

export function query(collectionInstance: any, ...constraints: any[]) {
  return {
    type: "query",
    path: collectionInstance.path,
  };
}

export function orderBy(field: string, direction: "asc" | "desc" = "asc") {
  return { type: "sort", field, direction };
}

export function onSnapshot(
  queryOrCollection: any,
  callback: (snapshot: any) => void,
  errorCallback?: (err: any) => void
) {
  snapshotListeners.add(callback);
  
  // Trigger initial fetch
  fetchReportsFromServer();
  
  // Return unsubscribe
  return () => {
    snapshotListeners.delete(callback);
  };
}

export async function setDoc(docRef: any, data: any): Promise<void> {
  // Reports are already auto-saved on the backend during the stream completion.
  // We simply append to our local cache and notify snapshot subscribers.
  const idx = reportsCache.findIndex((r) => r.id === data.id);
  if (idx >= 0) {
    reportsCache[idx] = data;
  } else {
    reportsCache.unshift(data);
  }
  triggerSnapshotListeners();
}
