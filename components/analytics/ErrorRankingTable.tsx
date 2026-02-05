
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ErrorRankingTableProps {
    errors: { message: string, count: number, agent: string }[];
}

export function ErrorRankingTable({ errors }: ErrorRankingTableProps) {
    return (
        <Card className="col-span-3">
            <CardHeader>
                <CardTitle>Frequent Errors</CardTitle>
                <CardDescription>
                    Most common error messages and their sources
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-8">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[300px]">Error Message</TableHead>
                                <TableHead>Agent</TableHead>
                                <TableHead className="text-right">Count</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {errors.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                                        No errors found via logs.
                                    </TableCell>
                                </TableRow>
                            )}
                            {errors.map((error, i) => (
                                <TableRow key={i}>
                                    <TableCell className="font-medium text-xs font-mono truncate max-w-[300px]" title={error.message}>
                                        {error.message}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{error.agent}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">{error.count}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
