"use client"

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { Upload, FileText, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface UploadedFile {
  file: File
  type: 'pdf' | 'xbrl'
  id: string
}

interface FileDropzoneProps {
  onFilesUploaded: (files: UploadedFile[]) => void
  maxFiles?: number
  className?: string
}

export function FileDropzone({
  onFilesUploaded,
  maxFiles = 10,
  className
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const validateFile = (file: File): { valid: boolean; type?: 'pdf' | 'xbrl'; error?: string } => {
    const fileName = file.name.toLowerCase()
    const fileExtension = fileName.split('.').pop() || ''
    const mimeType = file.type.toLowerCase()

    // 정규표현식으로 확장자 엄격히 체크
    const pdfPattern = /\.pdf$/i
    const xbrlPattern = /\.(xbrl|xml|zip)$/i

    // PDF 파일 엄격히 구분
    if (pdfPattern.test(fileName) || mimeType === 'application/pdf') {
      // XBRL 확장자가 포함된 PDF는 제외
      if (xbrlPattern.test(fileName)) {
        return { valid: false, error: '파일명에 XBRL 확장자가 포함되어 있습니다.' }
      }
      return { valid: true, type: 'pdf' }
    }

    // XBRL 파일 엄격히 구분 (.zip, .xbrl, .xml 확장자 필수)
    if (
      xbrlPattern.test(fileName) ||
      fileExtension === 'zip' ||
      fileExtension === 'xbrl' ||
      fileExtension === 'xml' ||
      mimeType === 'application/xml' ||
      mimeType === 'text/xml' ||
      mimeType === 'application/zip' ||
      mimeType === 'application/x-zip-compressed'
    ) {
      // ZIP 파일은 즉시 xbrl로 강제 지정 (압축 해제 후 내부 XML/XBRL 파일 분석)
      // PDF 분석 로직과 혼선 방지
      if (fileExtension === 'zip' || mimeType.includes('zip')) {
        return { valid: true, type: 'xbrl' }
      }
      return { valid: true, type: 'xbrl' }
    }

    return { valid: false, error: 'PDF 또는 XBRL(XML/ZIP) 파일만 업로드할 수 있습니다.' }
  }

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const validFiles: UploadedFile[] = []

    for (const file of fileArray) {
      const validation = validateFile(file)
      if (validation.valid && validation.type) {
        validFiles.push({
          file,
          type: validation.type,
          id: `${Date.now()}-${Math.random()}`
        })
      }
    }

    if (validFiles.length > 0) {
      const newFiles = [...uploadedFiles, ...validFiles].slice(0, maxFiles)
      setUploadedFiles(newFiles)
      setIsProcessing(true)
      
      // 파일 처리 시뮬레이션 (실제로는 파싱 시작)
      setTimeout(() => {
        setIsProcessing(false)
        onFilesUploaded(newFiles)
      }, 500)
    }
  }, [uploadedFiles, maxFiles, onFilesUploaded])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files)
    }
  }, [processFiles])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files)
    }
  }, [processFiles])

  const removeFile = useCallback((id: string) => {
    const newFiles = uploadedFiles.filter(f => f.id !== id)
    setUploadedFiles(newFiles)
    onFilesUploaded(newFiles)
  }, [uploadedFiles, onFilesUploaded])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn("w-full", className)}
    >
      {/* 드롭존 */}
      <motion.div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-12 transition-all duration-200",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.02]"
            : "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/30",
          isProcessing && "opacity-50 pointer-events-none"
        )}
      >
        <input
          type="file"
          id="file-upload"
          className="hidden"
          accept=".pdf,.xml,.xbrl,.zip"
          multiple
          onChange={handleFileInput}
          disabled={isProcessing || uploadedFiles.length >= maxFiles}
        />

        <label
          htmlFor="file-upload"
          className="flex flex-col items-center justify-center cursor-pointer"
        >
          {isProcessing ? (
            <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
          ) : (
            <Upload className="h-12 w-12 text-muted-foreground mb-4" />
          )}
          <p className="text-lg font-medium mb-2">
            {isProcessing ? '파일 처리 중...' : '파일을 드래그하거나 클릭하여 업로드'}
          </p>
          <p className="text-sm text-muted-foreground">
            PDF 또는 XBRL 파일 (최대 {maxFiles}개)
          </p>
        </label>
      </motion.div>

      {/* 업로드된 파일 목록 */}
      {uploadedFiles.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.3 }}
          className="mt-6 space-y-2"
        >
          <h3 className="text-sm font-medium mb-2">업로드된 파일</h3>
          {uploadedFiles.map((uploadedFile, index) => (
            <motion.div
              key={uploadedFile.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card"
            >
              <FileText className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{uploadedFile.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {uploadedFile.type.toUpperCase()} • {(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={() => removeFile(uploadedFile.id)}
                className="p-1 rounded hover:bg-muted transition-colors"
                disabled={isProcessing}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}
