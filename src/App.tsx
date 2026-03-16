import { GoogleGenAI, Type } from "@google/genai";
import { useState, FormEvent, useEffect } from "react";
import { ChefHat, Plus, X, Loader2, Utensils, Clock, Flame, Heart, Bookmark, Search, Sparkles, Globe, Image as ImageIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface Recipe {
  title: string;
  description: string;
  prepTime: string;
  cookTime: string;
  difficulty: string;
  ingredients: string[];
  instructions: string[];
}

interface IngredientItem {
  name: string;
  quantity: string;
}

const COMMON_INGREDIENTS = [
  "Garlic", "Onion", "Olive Oil", "Butter", "Eggs", "Milk", 
  "Chicken Breast", "Ground Beef", "Rice", "Pasta", "Potatoes", 
  "Tomatoes", "Cheese", "Lemon", "Carrots", "Spinach"
];

export default function App() {
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [quantityValue, setQuantityValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'generate' | 'saved'>('generate');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Tips state
  const [recipeTips, setRecipeTips] = useState<Record<string, string>>({});
  const [loadingTips, setLoadingTips] = useState<Record<string, boolean>>({});

  // Image state
  const [recipeImages, setRecipeImages] = useState<Record<string, string>>({});
  const [loadingImages, setLoadingImages] = useState<Record<string, boolean>>({});

  // Local Storage for saved recipes
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>(() => {
    const saved = localStorage.getItem('pantryChefSavedRecipes');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('pantryChefSavedRecipes', JSON.stringify(savedRecipes));
  }, [savedRecipes]);

  const toggleIngredient = (ing: string) => {
    const lowerIng = ing.toLowerCase();
    const exists = ingredients.some(i => i.name === lowerIng);
    if (exists) {
      setIngredients(ingredients.filter(i => i.name !== lowerIng));
    } else {
      setIngredients([...ingredients, { name: lowerIng, quantity: "" }]);
    }
  };

  const addIngredient = (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = inputValue.trim().toLowerCase();
    const trimmedQty = quantityValue.trim();
    if (trimmedName && !ingredients.some(i => i.name === trimmedName)) {
      setIngredients([...ingredients, { name: trimmedName, quantity: trimmedQty }]);
      setInputValue("");
      setQuantityValue("");
      setShowSuggestions(false);
    }
  };

  const removeIngredient = (ingToRemove: string) => {
    setIngredients(ingredients.filter((ing) => ing.name !== ingToRemove));
  };

  const toggleSaveRecipe = (recipe: Recipe) => {
    const isSaved = savedRecipes.some(r => r.title === recipe.title);
    if (isSaved) {
      setSavedRecipes(savedRecipes.filter(r => r.title !== recipe.title));
    } else {
      setSavedRecipes([...savedRecipes, recipe]);
    }
  };

  const fetchRecipeTips = async (recipe: Recipe) => {
    setLoadingTips(prev => ({ ...prev, [recipe.title]: true }));
    try {
      const prompt = `Find professional cooking tips, nutritional insights, or popular variations for a recipe titled '${recipe.title}' made with: ${recipe.ingredients.join(', ')}. Use Google Search to get the most accurate and up-to-date information. Keep it concise (1-2 paragraphs).`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      
      setRecipeTips(prev => ({ ...prev, [recipe.title]: response.text || "No tips found." }));
    } catch (err) {
      console.error("Error fetching tips:", err);
      setRecipeTips(prev => ({ ...prev, [recipe.title]: "Failed to load tips. Please try again." }));
    } finally {
      setLoadingTips(prev => ({ ...prev, [recipe.title]: false }));
    }
  };

  const generateRecipeImage = async (recipe: Recipe) => {
    setLoadingImages(prev => ({ ...prev, [recipe.title]: true }));
    try {
      const prompt = `A professional, appetizing food photography shot of ${recipe.title} made with ${recipe.ingredients.join(', ')}. Rustic presentation, vibrant colors, high quality, well-lit, cinematic culinary lighting, shallow depth of field, 4k resolution, food magazine style.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { text: prompt }
          ]
        }
      });
      
      let imageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          imageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${base64EncodeString}`;
          break;
        }
      }
      
      if (imageUrl) {
        setRecipeImages(prev => ({ ...prev, [recipe.title]: imageUrl }));
      } else {
        throw new Error("No image data returned");
      }
    } catch (err) {
      console.error("Error generating image:", err);
    } finally {
      setLoadingImages(prev => ({ ...prev, [recipe.title]: false }));
    }
  };

  const generateRecipes = async () => {
    if (ingredients.length === 0) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const ingredientsList = ingredients.map(i => i.quantity ? `${i.quantity} ${i.name}` : i.name).join(", ");
      const prompt = `I have the following ingredients: ${ingredientsList}. 
      Please provide 3 to 5 creative and delicious recipes I can make using mostly these ingredients. 
      It's okay to assume I have basic pantry staples like salt, pepper, oil, water, etc.
      For each recipe, provide a title, a short appetizing description, prep time, cook time, difficulty level (Easy, Medium, Hard), a list of ingredients with measurements, and step-by-step instructions.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "The name of the recipe." },
                description: { type: Type.STRING, description: "A short, appetizing description." },
                prepTime: { type: Type.STRING, description: "Preparation time, e.g., '15 mins'." },
                cookTime: { type: Type.STRING, description: "Cooking time, e.g., '30 mins'." },
                difficulty: { type: Type.STRING, description: "Difficulty level: Easy, Medium, or Hard." },
                ingredients: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "List of ingredients with measurements."
                },
                instructions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Step-by-step cooking instructions."
                }
              },
              required: ["title", "description", "prepTime", "cookTime", "difficulty", "ingredients", "instructions"]
            }
          }
        }
      });

      const jsonStr = response.text?.trim();
      if (jsonStr) {
        const parsedRecipes = JSON.parse(jsonStr) as Recipe[];
        setRecipes(parsedRecipes);
        setActiveTab('generate'); // Ensure we are on the generate tab to see results
      } else {
        throw new Error("Received empty response from the model.");
      }
    } catch (err) {
      console.error("Error generating recipes:", err);
      setError("Failed to generate recipes. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const renderRecipeCard = (recipe: Recipe, index: number) => {
    const isSaved = savedRecipes.some(r => r.title === recipe.title);
    const hasTips = !!recipeTips[recipe.title];
    const isLoadingTips = !!loadingTips[recipe.title];
    const hasImage = !!recipeImages[recipe.title];
    const isLoadingImage = !!loadingImages[recipe.title];
    
    return (
      <motion.article 
        key={recipe.title + index}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
        className="bg-white rounded-[32px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-ink/5 relative group"
      >
        <button
          onClick={() => toggleSaveRecipe(recipe)}
          className="absolute top-6 right-6 p-3 rounded-full bg-warm-bg/50 hover:bg-warm-bg transition-colors z-10"
          aria-label={isSaved ? "Remove from saved" : "Save recipe"}
        >
          <Heart className={`w-6 h-6 transition-colors ${isSaved ? 'fill-olive text-olive' : 'text-ink/40 group-hover:text-olive/70'}`} />
        </button>

        {/* Recipe Image Banner */}
        <div className="w-full h-64 md:h-80 bg-warm-bg relative overflow-hidden border-b border-ink/5">
          {hasImage ? (
            <img 
              src={recipeImages[recipe.title]} 
              alt={recipe.title} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : isLoadingImage ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-ink/50">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-olive" />
              <span className="text-sm font-medium tracking-wide uppercase">Cooking up an image...</span>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-ink/40 bg-warm-bg/50">
              <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
              <button 
                onClick={() => generateRecipeImage(recipe)}
                className="px-6 py-2.5 bg-white text-ink rounded-full font-medium shadow-sm hover:shadow transition-all border border-ink/5 flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4 text-olive" />
                Generate Visual
              </button>
            </div>
          )}
        </div>

        <div className="p-8 md:p-10">
          <div className="mb-8 pr-12">
            <h3 className="text-3xl md:text-4xl font-serif text-ink mb-4">{recipe.title}</h3>
            <p className="text-ink/70 text-lg leading-relaxed italic font-serif">{recipe.description}</p>
          </div>
          
          <div className="flex flex-wrap gap-6 mb-10 pb-8 border-b border-ink/10">
            <div className="flex items-center gap-2 text-ink/80">
              <Clock className="w-5 h-5 text-olive" />
              <span className="font-medium text-sm uppercase tracking-wider">Prep: {recipe.prepTime}</span>
            </div>
            <div className="flex items-center gap-2 text-ink/80">
              <Flame className="w-5 h-5 text-olive" />
              <span className="font-medium text-sm uppercase tracking-wider">Cook: {recipe.cookTime}</span>
            </div>
            <div className="flex items-center gap-2 text-ink/80">
              <ChefHat className="w-5 h-5 text-olive" />
              <span className="font-medium text-sm uppercase tracking-wider">Level: {recipe.difficulty}</span>
            </div>
          </div>

          <div className="grid md:grid-cols-[1fr_2fr] gap-12">
            {/* Ingredients */}
            <div>
              <h4 className="text-xl font-serif font-semibold mb-6 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-warm-bg flex items-center justify-center text-olive text-sm">1</span>
                Ingredients
              </h4>
              <ul className="space-y-3">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} className="flex items-start gap-3 text-ink/80">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-olive/50 shrink-0" />
                    <span className="leading-relaxed">{ing}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Instructions */}
            <div>
              <h4 className="text-xl font-serif font-semibold mb-6 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-warm-bg flex items-center justify-center text-olive text-sm">2</span>
                Instructions
              </h4>
              <ol className="space-y-6">
                {recipe.instructions.map((step, i) => (
                  <li key={i} className="flex gap-4 group/step">
                    <span className="font-serif text-2xl text-olive/40 font-bold group-hover/step:text-olive transition-colors">
                      {(i + 1).toString().padStart(2, '0')}
                    </span>
                    <p className="text-ink/80 leading-relaxed pt-1">{step}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* AI Tips Section */}
          <div className="mt-8 pt-6 border-t border-ink/10">
            {!hasTips && !isLoadingTips ? (
              <button
                onClick={() => fetchRecipeTips(recipe)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-warm-bg text-ink/80 rounded-full text-sm font-medium hover:bg-ink/5 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-olive" />
                Get Pro Tips & Variations (Web Search)
              </button>
            ) : isLoadingTips ? (
              <div className="flex items-center gap-2 text-ink/60 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching the web for tips...
              </div>
            ) : (
              <div className="bg-warm-bg/50 rounded-2xl p-6 border border-ink/5">
                <h4 className="text-lg font-serif font-semibold mb-3 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-olive" />
                  Web Insights & Tips
                </h4>
                <div className="text-ink/80 text-sm leading-relaxed markdown-body">
                  <Markdown>{recipeTips[recipe.title]}</Markdown>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.article>
    );
  };

  // Filter saved recipes
  const filteredSavedRecipes = savedRecipes.filter(recipe => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      recipe.title.toLowerCase().includes(query) ||
      recipe.cookTime.toLowerCase().includes(query) ||
      recipe.ingredients.some(ing => ing.toLowerCase().includes(query))
    );
  });

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">
        
        {/* Header */}
        <header className="text-center space-y-6">
          <div className="inline-flex items-center justify-center p-4 bg-white rounded-full shadow-sm">
            <ChefHat className="w-10 h-10 text-olive" />
          </div>
          <h1 className="text-5xl md:text-6xl font-serif text-ink tracking-tight">
            My Kitchen Assistant
          </h1>
          <p className="text-lg text-ink/70 max-w-2xl mx-auto font-sans font-light">
            Tell us what ingredients you have, and we'll craft delicious, step-by-step recipes just for you.
          </p>

          {/* Tabs */}
          <div className="flex justify-center gap-4 pt-4">
            <button
              onClick={() => setActiveTab('generate')}
              className={`px-6 py-2.5 rounded-full font-medium text-sm tracking-wide transition-all ${
                activeTab === 'generate' 
                  ? 'bg-ink text-white shadow-md' 
                  : 'bg-white text-ink/70 hover:bg-ink/5'
              }`}
            >
              Generate Recipes
            </button>
            <button
              onClick={() => setActiveTab('saved')}
              className={`px-6 py-2.5 rounded-full font-medium text-sm tracking-wide transition-all flex items-center gap-2 ${
                activeTab === 'saved' 
                  ? 'bg-ink text-white shadow-md' 
                  : 'bg-white text-ink/70 hover:bg-ink/5'
              }`}
            >
              <Bookmark className="w-4 h-4" />
              Saved Recipes ({savedRecipes.length})
            </button>
          </div>
        </header>

        {activeTab === 'generate' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-12"
          >
            {/* Input Section */}
            <section className="bg-white p-8 rounded-[32px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-ink/5">
              
              {/* Quick Add Tick System */}
              <div className="mb-8">
                <p className="text-xs text-ink/50 mb-3 font-semibold uppercase tracking-widest">Quick Add Ingredients</p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_INGREDIENTS.map(ing => {
                    const isSelected = ingredients.some(i => i.name === ing.toLowerCase());
                    return (
                      <button
                        key={ing}
                        type="button"
                        onClick={() => toggleIngredient(ing)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                          isSelected 
                            ? 'bg-olive text-white border-olive shadow-sm' 
                            : 'bg-warm-bg/50 text-ink/70 border-ink/10 hover:border-olive/40 hover:bg-warm-bg'
                        }`}
                      >
                        {ing}
                      </button>
                    )
                  })}
                </div>
              </div>

              <form onSubmit={addIngredient} className="relative flex gap-3">
                <input
                  type="text"
                  value={quantityValue}
                  onChange={(e) => setQuantityValue(e.target.value)}
                  placeholder="Qty (e.g. 2 cups)"
                  className="w-1/3 pl-6 pr-4 py-4 text-lg bg-warm-bg/50 border border-ink/10 rounded-full focus:outline-none focus:ring-2 focus:ring-olive/50 focus:border-olive transition-all placeholder:text-ink/40"
                />
                <div className="relative w-2/3">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="Type an ingredient..."
                    className="w-full pl-6 pr-16 py-4 text-lg bg-warm-bg/50 border border-ink/10 rounded-full focus:outline-none focus:ring-2 focus:ring-olive/50 focus:border-olive transition-all placeholder:text-ink/40"
                  />
                  
                  {/* Autocomplete Dropdown */}
                  {showSuggestions && inputValue && (
                    <div className="absolute z-20 w-full mt-2 bg-white border border-ink/10 rounded-2xl shadow-lg max-h-48 overflow-y-auto py-2">
                      {COMMON_INGREDIENTS.filter(i => i.toLowerCase().includes(inputValue.toLowerCase())).length > 0 ? (
                        COMMON_INGREDIENTS.filter(i => i.toLowerCase().includes(inputValue.toLowerCase())).map(ing => (
                          <div
                            key={ing}
                            className="px-6 py-2.5 hover:bg-warm-bg cursor-pointer text-ink/80 transition-colors"
                            onClick={() => {
                              setInputValue(ing);
                              setShowSuggestions(false);
                            }}
                          >
                            {ing}
                          </div>
                        ))
                      ) : (
                        <div className="px-6 py-2.5 text-ink/40 italic">Press enter to add custom ingredient</div>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!inputValue.trim()}
                    className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-olive text-white rounded-full hover:bg-olive-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>
              </form>

              {/* Ingredients List */}
              <div className="mt-6 flex flex-wrap gap-2 min-h-[40px] p-4 bg-warm-bg/30 rounded-2xl border border-ink/5">
                <AnimatePresence>
                  {ingredients.map((ing) => (
                    <motion.span
                      key={ing.name}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-ink rounded-full text-sm font-medium border border-ink/10 shadow-sm"
                    >
                      {ing.quantity ? <span className="text-ink/50 font-normal mr-1">{ing.quantity}</span> : null}
                      {ing.name}
                      <button
                        onClick={() => removeIngredient(ing.name)}
                        className="p-0.5 hover:bg-ink/10 rounded-full transition-colors ml-1"
                        aria-label={`Remove ${ing.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
                {ingredients.length === 0 && (
                  <p className="text-ink/40 text-sm italic py-2 px-2">Your selected ingredients will appear here.</p>
                )}
              </div>

              {/* Action Button */}
              <div className="mt-8 text-center">
                <button
                  onClick={generateRecipes}
                  disabled={ingredients.length === 0 || loading}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-olive text-white rounded-full font-medium text-lg tracking-wide hover:bg-olive-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Crafting Recipes...
                    </>
                  ) : (
                    <>
                      <Utensils className="w-5 h-5" />
                      Generate Recipes
                    </>
                  )}
                </button>
              </div>
              
              {error && (
                <p className="mt-4 text-center text-red-600 font-medium">{error}</p>
              )}
            </section>

            {/* Results Section */}
            {recipes.length > 0 && (
              <section className="space-y-8 pt-8 border-t border-ink/10">
                <h2 className="text-4xl font-serif text-center mb-12">Your Curated Menu</h2>
                <div className="space-y-12">
                  {recipes.map((recipe, index) => renderRecipeCard(recipe, index))}
                </div>
              </section>
            )}
          </motion.div>
        )}

        {activeTab === 'saved' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {savedRecipes.length > 0 && (
              <div className="relative max-w-xl mx-auto mb-8">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-ink/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search saved recipes by title, ingredient, or cook time..."
                  className="w-full pl-14 pr-6 py-4 bg-white border border-ink/10 rounded-full focus:outline-none focus:ring-2 focus:ring-olive/50 focus:border-olive transition-all shadow-sm text-lg placeholder:text-ink/40"
                />
              </div>
            )}

            {savedRecipes.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-[32px] border border-ink/5 shadow-sm">
                <Bookmark className="w-12 h-12 text-ink/20 mx-auto mb-4" />
                <h3 className="text-2xl font-serif text-ink mb-2">No saved recipes yet</h3>
                <p className="text-ink/60">Generate some recipes and click the heart icon to save them here.</p>
                <button 
                  onClick={() => setActiveTab('generate')}
                  className="mt-6 px-6 py-2 bg-warm-bg text-ink rounded-full font-medium hover:bg-ink/5 transition-colors"
                >
                  Go Generate
                </button>
              </div>
            ) : filteredSavedRecipes.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-[32px] border border-ink/5 shadow-sm">
                <Search className="w-12 h-12 text-ink/20 mx-auto mb-4" />
                <h3 className="text-2xl font-serif text-ink mb-2">No matches found</h3>
                <p className="text-ink/60">Try adjusting your search query.</p>
                <button 
                  onClick={() => setSearchQuery("")}
                  className="mt-6 px-6 py-2 bg-warm-bg text-ink rounded-full font-medium hover:bg-ink/5 transition-colors"
                >
                  Clear Search
                </button>
              </div>
            ) : (
              <div className="space-y-12">
                {filteredSavedRecipes.map((recipe, index) => renderRecipeCard(recipe, index))}
              </div>
            )}
          </motion.div>
        )}

      </div>
    </div>
  );
}
