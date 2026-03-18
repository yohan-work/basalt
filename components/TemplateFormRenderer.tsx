'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TemplateField, TemplateFieldValues, PropDefinition } from '@/lib/task-templates';
import { deserializeProps, serializeProps } from '@/lib/task-templates';
import { PropsBuilder } from '@/components/PropsBuilder';

interface TemplateFormRendererProps {
    fields: TemplateField[];
    values: TemplateFieldValues;
    onChange: (values: TemplateFieldValues) => void;
}

export function TemplateFormRenderer({ fields, values, onChange }: TemplateFormRendererProps) {
    const updateValue = (key: string, value: string | string[]) => {
        onChange({ ...values, [key]: value });
    };

    const toggleCheckbox = (key: string, optionValue: string) => {
        const current = Array.isArray(values[key]) ? (values[key] as string[]) : [];
        const next = current.includes(optionValue)
            ? current.filter(v => v !== optionValue)
            : [...current, optionValue];
        updateValue(key, next);
    };

    return (
        <div className="grid gap-3">
            {fields.map((field) => (
                <div key={field.key} className="grid gap-1.5">
                    <Label htmlFor={`field-${field.key}`} className="text-xs font-medium">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </Label>

                    {field.type === 'text' && (
                        <Input
                            id={`field-${field.key}`}
                            value={(values[field.key] as string) || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                updateValue(field.key, e.target.value)
                            }
                            placeholder={field.placeholder}
                            className="h-8 text-sm"
                        />
                    )}

                    {field.type === 'textarea' && (
                        <textarea
                            id={`field-${field.key}`}
                            value={(values[field.key] as string) || ''}
                            onChange={(e) => updateValue(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="flex min-h-[72px] w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                        />
                    )}

                    {field.type === 'select' && (
                        <select
                            id={`field-${field.key}`}
                            value={(values[field.key] as string) || ''}
                            onChange={(e) => updateValue(field.key, e.target.value)}
                            className="flex h-8 w-full border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                            {field.options?.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    )}

                    {field.type === 'radio' && (
                        <div className="flex flex-wrap gap-3">
                            {field.options?.map((opt) => (
                                <label
                                    key={opt.value}
                                    className="flex items-center gap-1.5 cursor-pointer text-sm"
                                >
                                    <input
                                        type="radio"
                                        name={`field-${field.key}`}
                                        value={opt.value}
                                        checked={(values[field.key] as string) === opt.value}
                                        onChange={() => updateValue(field.key, opt.value)}
                                        className="accent-primary"
                                    />
                                    <span className="text-xs">{opt.label}</span>
                                </label>
                            ))}
                        </div>
                    )}

                    {field.type === 'checkbox-group' && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                            {field.options?.map((opt) => {
                                const current = Array.isArray(values[field.key])
                                    ? (values[field.key] as string[])
                                    : [];
                                return (
                                    <label
                                        key={opt.value}
                                        className="flex items-center gap-1.5 cursor-pointer text-sm"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={current.includes(opt.value)}
                                            onChange={() => toggleCheckbox(field.key, opt.value)}
                                            className="rounded border-input accent-primary"
                                        />
                                        <span className="text-xs">{opt.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                    )}

                    {field.type === 'props-builder' && (
                        <PropsBuilder
                            value={deserializeProps(values[field.key])}
                            onChange={(props: PropDefinition[]) =>
                                updateValue(field.key, serializeProps(props))
                            }
                        />
                    )}
                </div>
            ))}
        </div>
    );
}
