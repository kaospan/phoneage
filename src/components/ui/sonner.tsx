import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = "system" } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps["theme"]}
            className="toaster group"
            visibleToasts={2}
            offset={{ top: "calc(env(safe-area-inset-top) + 0.5rem)", left: "0.5rem", right: "0.5rem", bottom: "0.5rem" }}
            toastOptions={{
                classNames: {
                    toast:
                        "group toast group-[.toaster]:bg-background/95 group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-md w-auto max-w-[min(22rem,calc(100vw-1rem))] p-3 text-sm [@media(orientation:landscape)_and_(max-height:500px)]:max-w-[min(20rem,55vw)]",
                    description: "group-[.toast]:text-muted-foreground group-[.toast]:text-[13px]",
                    actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
                    cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
                },
            }}
            {...props}
        />
    );
};

export { Toaster, toast };
