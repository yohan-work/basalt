'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import type { PropDefinition } from '@/lib/task-templates';
import { PROP_TYPE_OPTIONS } from '@/lib/task-templates';

interface PropsBuilderProps {
    value: PropDefinition[];
    onChange: (props: PropDefinition[]) => void;
}

const EMPTY_PROP: PropDefinition = {
    name: '',
    type: 'string',
    required: false,
    defaultValue: '',
    description: '',
};

export function PropsBuilder({ value, onChange }: PropsBuilderProps) {
    const [customTypes, setCustomTypes] = useState<Record<number, string>>({});

    const updateProp = (index: number, patch: Partial<PropDefinition>) => {
        const next = value.map((p, i) => (i === index ? { ...p, ...patch } : p));
        onChange(next);
    };

    const addProp = () => {
        onChange([...value, { ...EMPTY_PROP }]);
    };

    const removeProp = (index: number) => {
        onChange(value.filter((_, i) => i !== index));
        setCustomTypes(prev => {
            const next: Record<number, string> = {};
            for (const [k, v] of Object.entries(prev)) {
                const key = Number(k);
                if (key < index) next[key] = v;
                else if (key > index) next[key - 1] = v;
            }
            return next;
        });
    };

    const handleTypeChange = (index: number, selected: string) => {
        if (selected === 'custom') {
            const current = customTypes[index] || '';
            setCustomTypes(prev => ({ ...prev, [index]: current }));
            updateProp(index, { type: current || '' });
        } else {
            setCustomTypes(prev => {
                const next = { ...prev };
                delete next[index];
                return next;
            });
            updateProp(index, { type: selected });
        }
    };

    const handleCustomTypeInput = (index: number, val: string) => {
        setCustomTypes(prev => ({ ...prev, [index]: val }));
        updateProp(index, { type: val });
    };

    const isCustomType = (index: number, type: string): boolean => {
        if (index in customTypes) return true;
        return !(PROP_TYPE_OPTIONS as readonly string[]).includes(type);
    };

    return (
        <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-[1fr_140px_36px_100px_28px] gap-1.5 text-[10px] text-muted-foreground font-medium px-0.5">
                <span>이름</span>
                <span>타입</span>
                <span className="text-center">필수</span>
                <span>기본값</span>
                <span />
            </div>

            {value.map((prop, index) => {
                const showCustom = isCustomType(index, prop.type);
                return (
                    <div key={index} className="space-y-1">
                        <div className="grid grid-cols-[1fr_140px_36px_100px_28px] gap-1.5 items-center">
                            <Input
                                value={prop.name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    updateProp(index, { name: e.target.value })
                                }
                                placeholder="propName"
                                className="h-7 text-xs font-mono"
                            />
                            <select
                                value={showCustom ? 'custom' : prop.type}
                                onChange={(e) => handleTypeChange(index, e.target.value)}
                                className="h-7 w-full border border-input bg-background px-1.5 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                {PROP_TYPE_OPTIONS.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                            <label className="flex items-center justify-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={prop.required}
                                    onChange={(e) => updateProp(index, { required: e.target.checked })}
                                    className="accent-primary w-3.5 h-3.5"
                                />
                            </label>
                            <Input
                                value={prop.defaultValue || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    updateProp(index, { defaultValue: e.target.value })
                                }
                                placeholder="default"
                                className="h-7 text-xs"
                                disabled={prop.required}
                            />
                            <button
                                type="button"
                                onClick={() => removeProp(index)}
                                className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        {showCustom && (
                            <Input
                                value={customTypes[index] ?? prop.type}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    handleCustomTypeInput(index, e.target.value)
                                }
                                placeholder='커스텀 타입 (e.g. (item: T) => ReactNode)'
                                className="h-7 text-xs font-mono ml-0"
                            />
                        )}
                    </div>
                );
            })}

            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addProp}
                className="w-full h-7 text-xs"
            >
                <Plus className="h-3 w-3 mr-1" />
                Prop 추가
            </Button>
        </div>
    );
}
