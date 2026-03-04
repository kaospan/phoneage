import { PuzzleGame } from "@/components/PuzzleGame";
import LevelMapper from "@/components/LevelMapper";
import bgImage from "@/assets/stone-age-bg.png";
import { useLocation } from "react-router-dom";

console.log('📄 Index.tsx loading...');

const Index = () => {
    console.log('⚛️ Index component rendering...');

    try {
        const location = useLocation();
        const showMapper =
            location.pathname.includes("mapper") ||
            location.search.includes("mapper");
        console.log('🎮 Show mapper:', showMapper);

        return (
            <div
                className="min-h-screen p-2 md:p-4 relative overflow-hidden"
                style={{
                    backgroundImage: `url(${bgImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundAttachment: 'fixed',
                }}
            >
                <div
                    className="absolute inset-0 opacity-40 pointer-events-none"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 40%), radial-gradient(circle at 80% 30%, rgba(255,220,170,0.08), transparent 45%), linear-gradient(135deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.35) 100%)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                    }}
                />
                {/* Cool blue overlay for better readability */}
                <div className="absolute inset-0 bg-blue-900/40 scanline" />

                {/* Game content - prioritize playable area */}
                <div className="relative z-10 min-h-screen">
                    {showMapper ? <LevelMapper /> : <PuzzleGame />}
                </div>

                {/* Retro footer */}
                <div className="fixed bottom-1 left-0 right-0 z-10 pointer-events-none select-none">
                    <div className="mx-auto w-fit px-1 rounded bg-black/20 backdrop-blur-sm text-center pixel-text text-[8px] md:text-[10px] text-foreground/50">
                        STONE AGE REBOOT © 2025
                    </div>
                </div>
            </div>
        );
    } catch (error) {
        console.error('❌ Error in Index component:', error);
        throw error;
    }
};

console.log('✅ Index.tsx loaded');

export default Index;
