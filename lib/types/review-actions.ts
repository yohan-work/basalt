export interface ReviewSuggestionFile {
    filePath: string;
    before: string | null;
    after: string;
    reason?: string;
}

export interface ReviewSuggestionSet {
    createdAt: string;
    sourceReviewHash: string;
    files: ReviewSuggestionFile[];
}
