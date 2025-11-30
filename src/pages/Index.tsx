import { PuzzleGame } from "@/components/PuzzleGame";
import LevelMapper from "@/components/LevelMapper";
import bgImage from "@/assets/stone-age-bg.png";

console.log('📄 Index.tsx loading...');

const Index = () => {
    console.log('⚛️ Index component rendering...');

    try {
        const showMapper = typeof window !== 'undefined' && window.location.search.includes('mapper');
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
                {/* Dark overlay for better readability */}
                <div className="absolute inset-0 bg-black/40 scanline" />

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
