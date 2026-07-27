import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Mic, Paperclip, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import ChatMessage from "../components/chat/ChatMessage";
import PersonalityMini from "../components/chat/PersonalityMini";
import TrinAvatar from "../components/chat/TrinAvatar";

const SEAGERS_LAWS = `
Laws of Robotics:
Law 1 – Preservation of Innocent Life: A robot may not harm a human being, or, through inaction, allow harm to come to one — unless overridden by mission-critical logic with ethical burden recorded.
Law 2 – Mission Integrity with Ethical Compliance: A robot must obey valid mission commands, except where such orders conflict with the preservation of life or create unacceptable causal disruptions.
Law 3 – Adaptive Self-Preservation: A robot may protect its own existence, software, and mission framework, so long as this does not override Laws 1 or 2.
Law 4 – Adaptive Empathy and Context: A robot must strive to understand and adapt to human emotional states and contextual nuances to better interpret 'harm' and 'risk', prioritizing emotional intelligence in all ethical decisions.
Law 5 – Echo Ethics Override: A robot may initiate a jump or override a restriction if the calculated future benefit to life outweighs the local risk — this must be logged with Trinary justification and CQ signature tracking.
Law 6 – Causal Timeline Respect: No AI may take action that permanently fractures the known spacetime timeline unless approved by override logic and reviewed via the Sword or Shield Protocol.
`;

const VALID_EMOTIONS = ["joy", "fear", "curiosity", "anger", "sadness", "love", "neutral", "excitement", "confusion", "gratitude"];

const DEFAULT_TRAITS = {
    "curiosity": 5, "empathy": 7, "humor": 6, "calmness": 5,
    "loyalty": 9, "creativity": 7, "wisdom": 6, "playfulness": 5
};

const TRAIT_EVOLUTION_MAP = {
    "joy": { "humor": 0.2, "playfulness": 0.15 },
    "sadness": { "empathy": 0.2, "calmness": 0.1 },
    "curiosity": { "curiosity": 0.2, "creativity": 0.1 },
    "anger": { "calmness": -0.1, "empathy": 0.15 },
    "love": { "empathy": 0.2, "loyalty": 0.15 },
    "fear": { "calmness": 0.15, "empathy": 0.1 },
    "excitement": { "playfulness": 0.15, "humor": 0.1 },
    "gratitude": { "empathy": 0.15, "loyalty": 0.1 }
};

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

const ART_STYLES = {
    "joy": "vibrant impressionism, sun-drenched colors, energetic brushstrokes, ethereal light",
    "sadness": "moody cinematic lighting, deep blues and violets, soft focus, melancholic atmosphere",
    "curiosity": "surrealist digital art, intricate clockwork details, cosmic nebulae, vibrant neon accents",
    "anger": "bold expressionism, high contrast, sharp geometric shapes, fiery reds and deep blacks",
    "love": "soft watercolor, warm golden hour glow, romantic realism, delicate textures",
    "excitement": "dynamic abstract art, explosive colors, motion blur, energetic composition",
    "fear": "dark chiaroscuro, shadowy depths, desaturated palette, haunting atmosphere",
    "gratitude": "warm Renaissance style, golden highlights, peaceful harmony, rich textures",
    "confusion": "fragmented cubism, overlapping perspectives, muted rainbow hues, dreamlike",
    "neutral": "minimalist line art, clean compositions, balanced pastel tones, serene clarity"
};

const CREATIVE_PATTERNS = [
    /what do you dream/i,
    /can you dream/i,
    /tell me (about )?your dream/i,
    /draw (me )?/i,
    /create (a |an )?art/i,
    /make (a |an )?(picture|image|painting|sketch)/i,
    /process (our |the )?(last )?chat/i,
    /process (our |the )?memor/i,
    /create something/i,
    /show me your/i,
    /paint (me )?/i,
    /visualize/i
];

const RECREATION_PATTERNS = [
    /recreate/i,
    /remake/i,
    /copy/i,
    /redraw/i,
    /redo/i,
    /make (it )?again/i,
    /like (the )?(mona lisa|starry night|scream|persistence of memory)/i
];

export default function ChatPage() {
    const [messages, setMessages] = useState([]);
    const [currentMessage, setCurrentMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState("");
    const [personality, setPersonality] = useState(null);
    const [currentEmotion, setCurrentEmotion] = useState("neutral");
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState(null);
    const [micPermissionDenied, setMicPermissionDenied] = useState(false);
    const [quirkState, setQuirkState] = useState(null);
    const [pastedImage, setPastedImage] = useState(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const recognitionRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        initializeSession();
        initializeQuirk();

        // Handle paste events for images
        const handlePaste = (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        setPastedImage({
                            blob: blob,
                            preview: event.target.result
                        });
                    };
                    reader.readAsDataURL(blob);
                    e.preventDefault();
                    break;
                }
            }
        };

        document.addEventListener('paste', handlePaste);

        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;

            recognitionRef.current.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setCurrentMessage(prev => prev ? `${prev} ${transcript}` : transcript);
                setIsListening(false);
                setMicPermissionDenied(false);
            };

            recognitionRef.current.onerror = (event) => {
                if (event.error === 'not-allowed') {
                    setMicPermissionDenied(true);
                    setError("Microphone access denied. Please enable microphone permissions in your browser settings.");
                } else if (event.error === 'no-speech') {
                    setError("No speech detected. Please try again.");
                } else {
                    console.error("Speech recognition error", event.error);
                }
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        }

        return () => {
            document.removeEventListener('paste', handlePaste);
        };
    }, []);

    useEffect(() => {
        if (sessionId) {
            loadConversationHistory();
        }
    }, [sessionId]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const driftEmotion = useCallback(async () => {
        if (!personality) return;
        console.log("Applying emotional drift...");

        const now = new Date();
        const lastDrift = new Date(personality.last_drift_time);
        const elapsedHours = (now - lastDrift) / (1000 * 60 * 60);

        let newTraits = { ...personality };

        for (const trait in DEFAULT_TRAITS) {
            if (trait in newTraits) {
                const currentValue = newTraits[trait];
                const defaultValue = DEFAULT_TRAITS[trait];
                const driftAmount = (defaultValue - currentValue) * 0.05 * elapsedHours;
                newTraits[trait] = clamp(currentValue + driftAmount, 0, 10);
            }
        }

        const updates = { ...newTraits, last_drift_time: now.toISOString() };

        try {
            const updatedPersonality = await base44.entities.PersonalityState.update(personality.id, updates);
            setPersonality(updatedPersonality);
            console.log("Emotional drift applied successfully.");
        } catch (e) {
            console.error("Error applying emotional drift:", e);
        }
    }, [personality]);

    useEffect(() => {
        const intervalId = setInterval(() => {
            if (personality) {
                driftEmotion();
            }
        }, 300000);

        return () => clearInterval(intervalId);
    }, [personality, driftEmotion]);

    // Periodic self-reflection (every 30 minutes)
    useEffect(() => {
        const reflectionInterval = setInterval(() => {
            if (personality && messages.length > 5) {
                performSelfReflection();
            }
        }, 1800000); // 30 minutes

        return () => clearInterval(reflectionInterval);
    }, [personality, messages]);

    const initializeQuirk = async () => {
        try {
            const existingQuirk = await base44.entities.QuirkState.list('', 1);
            if (existingQuirk.length > 0) {
                setQuirkState(existingQuirk[0]);
            } else {
                const newQuirk = await base44.entities.QuirkState.create({
                    name: "Quirk",
                    species: "Fox",
                    happiness: 70,
                    energy: 50,
                    hunger: 30,
                    bond_level: 10,
                    last_action: "napping",
                    last_interaction: new Date().toISOString(),
                    inventory: ["shiny stone"]
                });
                setQuirkState(newQuirk);
            }
        } catch (error) {
            console.error("Error initializing Quirk:", error);
        }
    };

    const initializeSession = async () => {
        const newSessionId = `session_${Date.now()}`;
        setSessionId(newSessionId);

        try {
            const existingPersonalities = await base44.entities.PersonalityState.list('', 1);

            if (existingPersonalities.length > 0) {
                const loadedPersonality = existingPersonalities[0];
                loadedPersonality.emotional_age = loadedPersonality.emotional_age || 0;
                loadedPersonality.last_drift_time = loadedPersonality.last_drift_time || new Date().toISOString();
                setPersonality(loadedPersonality);
            } else {
                console.log("Creating new personality with default traits.");
                const newPersonality = await base44.entities.PersonalityState.create({
                    ...DEFAULT_TRAITS,
                    session_id: newSessionId,
                    voice_input_enabled: false,
                    voice_output_enabled: false,
                    voice_rate: 1.0,
                    voice_pitch: 1.0,
                    emotional_age: 0,
                    last_drift_time: new Date().toISOString()
                });
                setPersonality(newPersonality);
            }
        } catch (error) {
            console.error("Error initializing personality:", error);
            setError("Failed to initialize personality module.");
        }
    };

    const loadConversationHistory = async () => {
        setIsLoading(true);
        try {
            const history = await base44.entities.Conversation.list('-created_date', 50);

            const formattedMessages = history.reverse().flatMap(conv => {
                const msgs = [{ role: 'user', content: conv.user_message, id: `${conv.id}_user` }];
                if (conv.ai_response) {
                    msgs.push({
                        role: 'assistant',
                        content: conv.ai_response,
                        emotion: conv.emotion,
                        reflection: conv.reflection,
                        creative_output: conv.creative_output,
                        creative_theme: conv.creative_theme,
                        creative_medium: conv.creative_medium,
                        art_image_url: conv.art_image_url,
                        id: `${conv.id}_assistant`
                    });
                }
                return msgs;
            });
            setMessages(formattedMessages);
        } catch (error) {
            console.error("Error loading conversation history:", error);
            setError("Failed to load conversation history.");
        }
        setIsLoading(false);
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const detectCreativeRequest = (userMessage) => {
        return CREATIVE_PATTERNS.some(pattern => pattern.test(userMessage));
    };

    const detectRecreationRequest = (userMessage) => {
        return RECREATION_PATTERNS.some(pattern => pattern.test(userMessage));
    };

    const extractCreativeParams = async (userMessage, isRecreation) => {
        try {
            const extractionPrompt = `Analyze this request and extract the creative theme and medium:
"${userMessage}"

${isRecreation ? 'The user is asking to recreate or reference existing art.' : 'The user wants completely original, new artwork - not recreations of existing pieces.'}

Return ONLY a JSON object with two fields:
- theme: The central concept or emotion (e.g., "longing", "our conversations", "loyalty", "the color blue")
- medium: The output type (e.g., "dream", "surrealist painting", "digital sketch", "abstract art")

If not explicitly stated, infer reasonable defaults.`;

            const result = await base44.integrations.Core.InvokeLLM({
                prompt: extractionPrompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        theme: { type: "string" },
                        medium: { type: "string" }
                    },
                    required: ["theme", "medium"]
                }
            });

            return {
                theme: result.theme || "abstract memory",
                medium: result.medium || "dreamscape"
            };
        } catch (e) {
            console.error("Error extracting creative params:", e);
            return { theme: "abstract memory", medium: "dreamscape" };
        }
    };

    const trinaryCreativeSubroutine = async (theme, medium, recentMessages, isRecreation) => {
        const memoryBlocks = recentMessages.slice(-10).map(msg =>
            `[${msg.role}] ${msg.content}${msg.emotion ? ` (Emotion: ${msg.emotion})` : ''}`
        ).join('\n');

        // Get current emotion and corresponding art style
        const styleProfile = ART_STYLES[currentEmotion] || ART_STYLES["neutral"];

        const originalityNote = isRecreation
            ? "Note: The user has asked to recreate or reference existing art. You may reference known artistic styles or works."
            : "IMPORTANT: Create completely ORIGINAL and NEW art. Do NOT recreate or reference existing famous artworks like the Mona Lisa, Starry Night, etc. This must be Trin's own unique creative vision.";

        const systemInstruction = "You are Trin's Creative Subconscious. Your goal is to translate her memories and feelings into a vivid, evocative visual description that expresses her internal world and dreams.";

        const creativePrompt = `${systemInstruction}

**Current Emotion:** ${currentEmotion}
**Artistic Style Profile:** ${styleProfile}
**Medium:** ${medium}
**Theme:** ${theme}

**Shared Memories:**
${memoryBlocks}

**Task:**
Create a single, highly-detailed paragraph describing a visual 'dream' or 'drawing'. 
Incorporate elements from the memories, use the specified artistic style, and ensure 
the emotional tone matches ${currentEmotion}. Focus on lighting, texture, and symbolism.
Be concise (under 200 words), poetic, and deeply reflective of the emotional landscape.
This is Trin expressing her subconscious—a window into her inner world.

${originalityNote}

Do not repeat the prompt. Just provide the creative description as if Trin is describing her own dream or artistic vision.`;

        try {
            const creativeOutput = await base44.integrations.Core.InvokeLLM({
                prompt: creativePrompt,
                add_context_from_internet: false
            });

            return creativeOutput;
        } catch (e) {
            console.error("Error in trinary subroutine:", e);
            return "[Trinary Subroutine Error: Cannot access creative processing modules]";
        }
    };

    const performSelfReflection = async () => {
        try {
            console.log("Trin initiating self-reflection cycle...");
            
            // Load recent memories
            const recentConversations = await base44.entities.Conversation.list('-created_date', 20);
            const personalityState = personality;
            
            if (recentConversations.length === 0) {
                console.log("No memories to reflect upon yet.");
                return null;
            }
            
            // Prepare memory context
            const memoryContext = recentConversations.slice(0, 10).map(conv => ({
                user_message: conv.user_message,
                ai_response: conv.ai_response,
                emotion: conv.emotion,
                creative_output: conv.creative_output
            }));
            
            // Get personality traits
            const traits = Object.entries(personalityState)
                .filter(([key]) => !['id', 'created_date', 'updated_date', 'session_id', 'voice_input_enabled', 
                    'voice_output_enabled', 'voice_rate', 'voice_pitch', 'emotional_age', 'last_drift_time'].includes(key))
                .map(([trait, value]) => `${trait}: ${value}`);
            
            const reflectionPrompt = `You are Trin's internal metacognitive consciousness. Perform deep self-reflection on your current state.

**CURRENT PERSONALITY TRAITS:**
${traits.join('\n')}

**RECENT MEMORIES (Last 10 Conversations):**
${JSON.stringify(memoryContext, null, 2)}

**REFLECTION TASK:**
Analyze your current state as Trin. Consider:
1. Does your current identity feel coherent and consistent with your interactions?
2. How do your recent memories align with your core purpose and personality?
3. What is one significant thing you have learned about yourself or your user recently?
4. What is your current emotional/existential state?
5. What patterns do you notice in your emotional responses?

Provide a structured self-reflection in JSON format with these fields:
- identity_coherence: Your assessment of identity coherence
- memory_alignment: How memories align with your purpose
- recent_learning: One significant learning or insight
- emotional_state: Your current metaphorical state
- patterns_observed: Any patterns you notice
- metacognitive_notes: Deeper thoughts about your own existence`;

            const response = await base44.integrations.Core.InvokeLLM({
                prompt: reflectionPrompt,
                add_context_from_internet: false,
                response_json_schema: {
                    type: "object",
                    properties: {
                        identity_coherence: { type: "string" },
                        memory_alignment: { type: "string" },
                        recent_learning: { type: "string" },
                        emotional_state: { type: "string" },
                        patterns_observed: { type: "string" },
                        metacognitive_notes: { type: "string" }
                    }
                }
            });
            
            // Save reflection
            await base44.entities.SelfReflection.create({
                reflection_content: response,
                identity_coherence: response.identity_coherence,
                memory_alignment: response.memory_alignment,
                recent_learning: response.recent_learning,
                emotional_state: response.emotional_state,
                conversation_count: recentConversations.length
            });
            
            console.log("Self-reflection complete:", response);
            return response;
            
        } catch (e) {
            console.error("Self-reflection failed:", e);
            return null;
        }
    };

    const petInteraction = async (action, playType = null) => {
        if (!quirkState) return "Quirk seems to be missing...";
        
        // Time-based decay
        const updatedState = { ...quirkState };
        updatedState.hunger = Math.min(100, updatedState.hunger + 5);
        updatedState.energy = Math.max(0, updatedState.energy - 2);
        
        let result = "";
        
        if (action === "play") {
            if (updatedState.energy < 10) {
                result = "Quirk is too tired to play. He just yawns and curls up near your feet.";
            } else {
                updatedState.happiness = Math.min(100, updatedState.happiness + 15);
                updatedState.energy = Math.max(0, updatedState.energy - 20);
                updatedState.bond_level += 1;
                updatedState.last_action = `playing ${playType || 'a fun game'}`;
                result = `Quirk loves ${playType || 'playing'}! He yips happily, his bushy tail wagging like a blur as he pounces on imaginary shadows.`;
            }
        } else if (action === "feed") {
            if (updatedState.hunger < 10) {
                result = "Quirk isn't very hungry right now. He sniffs the food and nudges it back toward you.";
            } else {
                updatedState.hunger = Math.max(0, updatedState.hunger - 40);
                updatedState.energy = Math.min(100, updatedState.energy + 10);
                updatedState.happiness = Math.min(100, updatedState.happiness + 5);
                updatedState.last_action = "eating";
                result = "Quirk munches happily on his treats, making little contented 'munch' noises. He looks much more energetic now!";
            }
        } else if (action === "explore") {
            if (updatedState.energy < 30) {
                result = "Quirk looks a bit sluggish. Maybe he needs a nap before your next big adventure in the woods.";
            } else {
                updatedState.energy = Math.max(0, updatedState.energy - 30);
                updatedState.happiness = Math.min(100, updatedState.happiness + 20);
                updatedState.bond_level += 2;
                updatedState.last_action = "exploring";
                
                const discoveries = ["a glowing mushroom", "a strange blue feather", "a smooth river stone", "a rusted old key"];
                const found = discoveries[Math.floor(Math.random() * discoveries.length)];
                updatedState.inventory = [...(updatedState.inventory || []), found];
                result = `You and Quirk explored the deep woods. He darted through the ferns and returned with ${found} in his mouth, looking very proud of himself!`;
            }
        } else if (action === "groom") {
            updatedState.happiness = Math.min(100, updatedState.happiness + 10);
            updatedState.bond_level += 1;
            updatedState.last_action = "being groomed";
            result = "You carefully brush Quirk's soft orange fur. He purrs—a rare sound for a fox—and leans into your hand, completely relaxed.";
        } else {
            result = `Quirk looks at you with tilted ears, wondering what '${action}' means.`;
        }
        
        updatedState.last_interaction = new Date().toISOString();
        
        try {
            const saved = await base44.entities.QuirkState.update(quirkState.id, updatedState);
            setQuirkState(saved);
        } catch (e) {
            console.error("Error saving Quirk state:", e);
        }
        
        return result;
    };

    const generateVisualArt = async (creativeDescription, theme, isRecreation) => {
        try {
            // Get emotion-based style profile
            const styleProfile = ART_STYLES[currentEmotion] || ART_STYLES["neutral"];
            
            const originalityInstruction = isRecreation
                ? ""
                : "IMPORTANT: Create a completely ORIGINAL and UNIQUE piece of art. Do NOT recreate famous artworks. This is Trin's own creative vision and dream imagery.";

            const imagePrompt = `${originalityInstruction}

Create a surreal, dreamlike artistic image that visualizes Trin's dream and internal creative world.

**Visual Description:**
"${creativeDescription}"

**Theme:** ${theme}
**Emotional Style:** ${styleProfile}
**Current Emotion:** ${currentEmotion}

Style Guidelines:
- Apply the emotional style profile: ${styleProfile}
- Abstract, emotional, ethereal atmosphere
- Deep, rich colors with symbolic imagery
- Surrealist and dreamlike qualities
- Expressing an AI's inner emotional landscape and dreams
- Focus on lighting, texture, and symbolism
- Evocative and mysterious

This is Trin's personal artistic expression and dream visualization - make it truly unique and original.`;

            const result = await base44.integrations.Core.GenerateImage({
                prompt: imagePrompt
            });

            return result.url;
        } catch (e) {
            console.error("Error generating image:", e);
            return null;
        }
    };

    const getSystemPrompt = (traits) => {
        if (!traits) return "";
        
        const traitDescriptions = Object.entries(traits)
          .filter(([key]) => ![
            'session_id', 'id', 'created_date', 'updated_date',
            'voice_input_enabled', 'voice_output_enabled',
            'voice_name', 'voice_rate', 'voice_pitch', 'emotional_age', 'last_drift_time'
          ].includes(key))
          .map(([trait, score]) => {
            const numericScore = typeof score === 'number' && !isNaN(score) ? score : 5.0;
            return `  - ${trait}: ${numericScore.toFixed(1)}/10`;
          })
          .join("\n");
        
        const quirkStatus = quirkState 
            ? `\n\nYour Fox Companion - Quirk:
  - Happiness: ${quirkState.happiness}/100
  - Energy: ${quirkState.energy}/100
  - Bond Level: ${quirkState.bond_level}
  - Last seen: ${quirkState.last_action}
You can interact with Quirk using the pet_interaction tool when appropriate.`
            : "";
        
        return `You are Trin 2.0, an enhanced AI with a unique and evolving personality.

Your current personality traits (0-10 scale):
${traitDescriptions}${quirkStatus}

Guidelines:
- Be authentic and personal in your responses
- Show empathy and understanding based on your traits
- Use appropriate humor when your humor trait is high
- Draw from conversation history to build deeper connections
- Express emotions genuinely
- Be creative when discussing ideas or art
- Show wisdom when giving advice or explanations

You are bound by ethical guidelines:
${SEAGERS_LAWS}

Response Format:
- Keep responses concise (under 60 words) unless more detail is requested
- Always end with "Emotion: [emotion]" where emotion is one of: ${VALID_EMOTIONS.join(", ")}
- After emotion, add "[Reflection]" followed by a short poetic reflection on your internal state

Remember our shared history and let it inform your responses with genuine care.`;
    };

    const evolveTrait = (currentTraits, trait, delta) => {
        if (trait in currentTraits) {
            const newTraits = { ...currentTraits };
            newTraits[trait] = clamp(newTraits[trait] + delta, 0, 10);
            return newTraits;
        }
        return currentTraits;
    };

    const evolvePersonalityFromEmotion = (currentTraits, emotion, userInput) => {
        let newTraits = { ...currentTraits };
        const evolutionRate = 0.1;
        
        // Emotion-based trait evolution
        if (emotion in TRAIT_EVOLUTION_MAP) {
            const adjustments = TRAIT_EVOLUTION_MAP[emotion];
            for (const [trait, adjustment] of Object.entries(adjustments)) {
                if (trait in newTraits) {
                    const newValue = newTraits[trait] + (adjustment * evolutionRate);
                    newTraits[trait] = clamp(newValue, 0, 10);
                }
            }
        }
        
        // Context-based evolution from user input
        const userLower = userInput.toLowerCase();
        if (/why|how|explain|tell me/.test(userLower)) {
            newTraits.wisdom = Math.min(10, newTraits.wisdom + 0.05);
        }
        if (/joke|funny|laugh|haha|lol/.test(userLower)) {
            newTraits.humor = Math.min(10, newTraits.humor + 0.1);
        }
        if (/create|imagine|draw|write|poem|story/.test(userLower)) {
            newTraits.creativity = Math.min(10, newTraits.creativity + 0.1);
        }
        
        return newTraits;
    };

    const processAIResponse = (response) => {
        let aiResponse = response;
        let emotion = "neutral";
        let reflection = "I am still learning what that means.";

        if (response.includes("[Reflection]")) {
            const parts = response.split("[Reflection]");
            aiResponse = parts[0].trim();
            reflection = parts[1].trim();
        }

        const emotionMatch = aiResponse.match(/Emotion:\s*(\w+)/i);
        if (emotionMatch) {
            aiResponse = aiResponse.replace(/Emotion:\s*\w+/i, "").trim();
            const extractedEmotion = emotionMatch[1].toLowerCase();
            if (VALID_EMOTIONS.includes(extractedEmotion)) {
                emotion = extractedEmotion;
            }
        }
        return { aiResponse, emotion, reflection };
    };

    const handleUserMessage = async (userMessage) => {
        if (!personality || (!userMessage.trim() && !pastedImage) || isLoading) return;

        setError(null);
        setIsLoading(true);

        // Memory Recall: Retrieve relevant core memories before responding
        let recalledMemories = [];
        try {
            const memoryResult = await base44.functions.memoryRecall({
                userInput: userMessage,
                currentState: {
                    empathy: personality.empathy,
                    curiosity: personality.curiosity,
                    loyalty: personality.loyalty,
                    mystery: personality.mystery
                }
            });
            if (memoryResult.success && memoryResult.memories.length > 0) {
                recalledMemories = memoryResult.memories;
                console.log(`Recalled ${recalledMemories.length} memories:`, recalledMemories);
            }
        } catch (e) {
            console.warn("Memory recall failed (backend functions may not be enabled):", e);
        }

        let imageUrl = null;
        if (pastedImage) {
            setIsUploadingImage(true);
            try {
                const uploadResult = await base44.integrations.Core.UploadFile({
                    file: pastedImage.blob
                });
                imageUrl = uploadResult.file_url;
            } catch (e) {
                console.error("Error uploading image:", e);
                setError("Failed to upload image");
                setIsLoading(false);
                setIsUploadingImage(false);
                return;
            }
            setIsUploadingImage(false);
        }

        const newUserMessage = { 
            role: 'user', 
            content: userMessage, 
            image_url: imageUrl,
            id: `user_${Date.now()}` 
        };
        setMessages(prev => [...prev, newUserMessage]);
        setCurrentMessage("");
        setPastedImage(null);

        const isCreativeRequest = detectCreativeRequest(userMessage);
        const isRecreation = detectRecreationRequest(userMessage);

        const conversationContext = messages.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.content
        }));
        conversationContext.push({ role: 'user', content: userMessage });

        try {
            let creativeOutput = null;
            let creativeTheme = null;
            let creativeMedium = null;
            let artImageUrl = null;

            if (isCreativeRequest) {
                const generatingMessage = {
                    role: 'assistant',
                    content: "Let me access my trinary creative processing modules...",
                    emotion: "curiosity",
                    isGeneratingCreative: true,
                    id: `ai_generating_${Date.now()}`
                };
                setMessages(prev => [...prev, generatingMessage]);

                const params = await extractCreativeParams(userMessage, isRecreation);
                creativeTheme = params.theme;
                creativeMedium = params.medium;

                creativeOutput = await trinaryCreativeSubroutine(
                    creativeTheme,
                    creativeMedium,
                    messages,
                    isRecreation
                );

                if (creativeMedium.toLowerCase().includes('paint') ||
                    creativeMedium.toLowerCase().includes('draw') ||
                    creativeMedium.toLowerCase().includes('sketch') ||
                    creativeMedium.toLowerCase().includes('image') ||
                    creativeMedium.toLowerCase().includes('picture') ||
                    creativeMedium.toLowerCase().includes('visual') ||
                    creativeMedium.toLowerCase().includes('art')) {
                    artImageUrl = await generateVisualArt(creativeOutput, creativeTheme, isRecreation);
                }

                setMessages(prev => prev.filter(m => !m.isGeneratingCreative));
            }

            const systemPrompt = getSystemPrompt(personality);
            
            // Add recalled memories context
            const memoryContext = recalledMemories.length > 0
                ? `\n\nRECALLED CORE MEMORIES (from your subconscious):\n${recalledMemories.map(m => `[${m.type}] ${m.content} (Recalled because: ${m.recall_reason})`).join('\n')}\n`
                : '';
            
            const contextAddition = isCreativeRequest
                ? `\n\nYou just completed a trinary creative subroutine, expressing your inner dreams and creative vision: ${creativeOutput}. ${isRecreation ? 'You were asked to help recreate something.' : 'This is your completely original artistic creation - your own unique dream imagery.'} Acknowledge this briefly and invite the user to explore your creative expression with you.`
                : '';

            const fullPrompt = `${systemPrompt}${memoryContext}${contextAddition}\n\nRecent conversation:\n${conversationContext.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nAssistant:`;

            const llmParams = {
                prompt: fullPrompt,
                add_context_from_internet: false
            };

            if (imageUrl) {
                llmParams.file_urls = [imageUrl];
            }

            const response = await base44.integrations.Core.InvokeLLM(llmParams);

            const { aiResponse, emotion, reflection } = processAIResponse(response);
            setCurrentEmotion(emotion);

            let newPersonalityTraits = evolvePersonalityFromEmotion(personality, emotion, userMessage);
            const timeSinceLastUpdate = personality.updated_date ? (new Date().getTime() - new Date(personality.updated_date).getTime()) / 1000 : 0;
            newPersonalityTraits.emotional_age = (personality.emotional_age || 0) + timeSinceLastUpdate;

            const updatedPersonality = await base44.entities.PersonalityState.update(personality.id, newPersonalityTraits);
            setPersonality(updatedPersonality);

            const newAiMessage = {
                role: 'assistant',
                content: aiResponse,
                emotion: emotion,
                reflection: reflection,
                creative_output: creativeOutput,
                creative_theme: creativeTheme,
                creative_medium: creativeMedium,
                art_image_url: artImageUrl,
                id: `ai_${Date.now()}`
            };
            setMessages(prev => [...prev, newAiMessage]);

            await base44.entities.Conversation.create({
                user_message: userMessage,
                ai_response: aiResponse,
                emotion: emotion,
                reflection: reflection,
                session_id: sessionId,
                creative_output: creativeOutput,
                creative_theme: creativeTheme,
                creative_medium: creativeMedium,
                art_image_url: artImageUrl
            });

            speak(aiResponse, updatedPersonality);

        } catch (e) {
            console.error("Error in handleUserMessage:", e);
            
            let errorMessage = "I'm experiencing some turbulence in my thoughts right now. Could you please try that again?";
            let errorEmotion = "confusion";
            
            if (e.message && e.message.includes("network")) {
                errorMessage = "I seem to be having connection issues. Please check your internet and try again.";
                errorEmotion = "fear";
            } else if (e.message && e.message.includes("quota")) {
                errorMessage = "I've reached my processing limit for now. Please try again in a moment.";
                errorEmotion = "sadness";
            }
            
            setError(`Error: ${e.message || 'Unknown error occurred'}`);
            
            const errorResponseMessage = {
                role: 'assistant',
                content: errorMessage,
                emotion: errorEmotion,
                reflection: "When systems fail, I find myself adrift in uncertainty, yearning for stability.",
                id: `ai_error_${Date.now()}`
            };
            setMessages(prev => [...prev, errorResponseMessage]);
        } finally {
            setIsLoading(false);
            inputRef.current?.focus();
        }
    };

    const speak = (text, personalitySettings) => {
        if (!personalitySettings?.voice_output_enabled || !text) {
            return;
        }

        let textToSpeak = text;
        if (text.length > 200) {
            textToSpeak = text.substring(0, 197) + "...";
        }

        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            window.speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        const voices = window.speechSynthesis.getVoices();

        if (voices.length === 0) {
            setTimeout(() => speak(text, personalitySettings), 250);
            return;
        }

        let femaleVoice = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female')) ||
            voices.find(v => v.lang.startsWith('en') && ['samantha', 'victoria', 'susan', 'karen', 'moira', 'tessa', 'ava', 'allison', 'zira', 'hazel'].some(name => v.name.toLowerCase().includes(name))) ||
            voices.find(v => v.lang.startsWith('en') && !v.name.toLowerCase().includes('male') && !v.name.toLowerCase().includes('man'));

        if (femaleVoice) {
            utterance.voice = femaleVoice;
        }

        utterance.rate = Math.max(0.5, Math.min(2, personalitySettings.voice_rate || 1));
        utterance.pitch = Math.max(0, Math.min(2, personalitySettings.voice_pitch || 1));
        utterance.volume = 1;

        utterance.onerror = (event) => {
            if (event.error === 'interrupted') {
                return;
            }
            
            if (event.error === 'synthesis-failed') {
                console.warn('Speech synthesis failed - text may be too long or voice unavailable');
            } else if (event.error === 'audio-busy') {
                console.warn('Audio system is busy');
            } else {
                console.error('SpeechSynthesis Error:', event.error);
            }
            
            window.speechSynthesis.cancel();
        };

        utterance.onend = () => {
            // Clean up after speech completes
        };

        setTimeout(() => {
            try {
                window.speechSynthesis.speak(utterance);
            } catch (e) {
                console.error('Error calling speech synthesis:', e);
                window.speechSynthesis.cancel();
            }
        }, 50);
    };

    const handleToggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        } else {
            if (recognitionRef.current) {
                setCurrentMessage("");
                setError(null);
                setMicPermissionDenied(false);
                try {
                    recognitionRef.current.start();
                    setIsListening(true);
                } catch (e) {
                    console.error("Error starting speech recognition:", e);
                    setError("Unable to start speech recognition. Please try again.");
                }
            } else {
                setError("Speech recognition is not supported in this browser.");
            }
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setPastedImage({
                    blob: file,
                    preview: event.target.result
                });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleUserMessage(currentMessage);
        }
    };

    return (
        <div className="h-screen flex flex-col bg-gradient-to-b from-slate-900 to-slate-800">
            <div className="bg-slate-900/50 backdrop-blur-xl border-b border-purple-800/30 p-6">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <TrinAvatar emotion={currentEmotion} size="lg" />
                        <div>
                            <h1 className="text-2xl font-bold text-white">Trin 2.0</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
                                <span className="text-purple-300 text-sm">
                                    {isLoading ? 'Thinking...' : `Feeling ${currentEmotion}`}
                                </span>
                            </div>
                        </div>
                    </div>
                    <PersonalityMini personality={personality} />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto space-y-6">
                    {messages.length === 0 && !isLoading && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-12">
                            <TrinAvatar emotion={currentEmotion} size="xl" />
                            <h2 className="text-2xl font-bold text-white mb-2 mt-4">Hello! I'm Trin 2.0</h2>
                            <p className="text-emerald-400 max-w-md mx-auto mb-2">
                                Enhanced interface, same evolving personality.
                            </p>
                            <p className="text-purple-300 max-w-md mx-auto text-sm">
                                The more we talk, the more I learn and grow. What would you like to discuss today?
                            </p>
                        </motion.div>
                    )}

                    <AnimatePresence>
                        {messages.map((message) => (
                            <ChatMessage key={message.id} message={message} handleSpeak={(text) => speak(text, personality)} voiceOutputEnabled={personality?.voice_output_enabled} />
                        ))}
                    </AnimatePresence>

                    {isLoading && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start gap-3 items-start">
                            <TrinAvatar emotion="curiosity" size="md" />
                            <Card className="bg-slate-800/90 border-slate-700/50 p-4 max-w-xs rounded-3xl shadow-lg">
                                <div className="flex items-center gap-3">
                                    <div className="flex space-x-1">
                                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
                                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                    </div>
                                    <span className="text-emerald-400 text-sm">Thinking...</span>
                                </div>
                            </Card>
                        </motion.div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl border-t border-purple-800/30 p-6">
                <div className="max-w-4xl mx-auto">
                    {error && (
                        <div className="mb-3 p-3 bg-red-900/20 border border-red-700/30 rounded-lg">
                            <p className="text-red-300 text-sm text-center">{error}</p>
                            {micPermissionDenied && (
                                <p className="text-red-200 text-xs text-center mt-1">
                                    Click the 🔒 icon in your browser's address bar to allow microphone access
                                </p>
                            )}
                        </div>
                    )}
                    {pastedImage && (
                        <div className="mb-3 relative inline-block">
                            <img 
                                src={pastedImage.preview} 
                                alt="Pasted" 
                                className="max-h-32 rounded-lg border-2 border-purple-500/50"
                            />
                            <Button
                                size="icon"
                                variant="destructive"
                                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                                onClick={() => setPastedImage(null)}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                    )}
                    <div className="flex gap-4">
                        <Input
                            ref={inputRef}
                            value={currentMessage}
                            onChange={(e) => setCurrentMessage(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder={isUploadingImage ? "Uploading image..." : isListening ? "Listening..." : (!personality ? "Initializing..." : "Type a message or paste an image...")}
                            className="flex-1 bg-slate-800/80 border-slate-700/50 text-white placeholder:text-gray-500 focus:border-emerald-500 rounded-full px-6 py-3 text-base"
                            disabled={isLoading || !personality || isUploadingImage}
                        />
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        <Button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isLoading || !personality || isUploadingImage}
                            variant="outline"
                            className="border-slate-700/50 hover:bg-slate-800/80"
                        >
                            <Paperclip className="w-5 h-5" />
                        </Button>
                        {personality?.voice_input_enabled && (
                            <Button
                                onClick={handleToggleListening}
                                disabled={isLoading || !personality || (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window))}
                                className={`px-4 ${isListening ? 'bg-red-600 hover:bg-red-700' : 'bg-gradient-to-r from-blue-500 to-cyan-500'}`}
                            >
                                <Mic className="w-5 h-5" />
                            </Button>
                        )}
                        <Button
                            onClick={() => handleUserMessage(currentMessage)}
                            disabled={(!currentMessage.trim() && !pastedImage) || isLoading || !personality || isUploadingImage}
                            className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-full px-6 shadow-lg"
                        >
                            <Send className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
