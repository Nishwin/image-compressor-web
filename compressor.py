import os
import shutil
from PIL import Image

supported_extensions = ('.png', '.jpg', '.jpeg', '.webp')

def compress_folder(
    input_folder: str,
    output_folder: str,
    default_quality: int = 80,
    jpg_quality: int = 70,
    png_quality: int = 90,
    use_lossless_for_pngs: bool = False,
    dry_run: bool = False,
    output_format: str = "webp",
    progress_callback=None,
):
    """
    progress_callback(current, total, filename): called after each file is processed.
    """
    if not os.path.exists(input_folder):
        raise FileNotFoundError(f"Input folder not found: {input_folder}")

    # Validate and normalize output format
    fmt = output_format.lower().strip()
    if fmt not in ("webp", "jpg", "jpeg", "png"):
        fmt = "webp"
    # Normalize jpeg -> jpg for consistency
    if fmt == "jpeg":
        fmt = "jpg"

    # Pillow save format strings
    pillow_format_map = {"webp": "webp", "jpg": "JPEG", "png": "PNG"}
    pillow_fmt = pillow_format_map[fmt]
    out_ext = ".jpg" if fmt == "jpg" else f".{fmt}"

    # Pre-scan to count total images for progress tracking
    all_image_files = []
    for root, _, files in os.walk(input_folder):
        for filename in files:
            if filename.lower().endswith(supported_extensions):
                all_image_files.append((root, filename))
    total_files = len(all_image_files)

    # Stats tracking
    format_counts = {ext: 0 for ext in supported_extensions}
    converted_count = 0
    skipped_count = 0
    total_original_size = 0
    total_converted_size = 0
    log_lines = []
    processed_count = 0

    log_lines.append(f"Starting recursive image conversion to {fmt.upper()}... {'(DRY RUN)' if dry_run else ''}")
    log_lines.append(f"Found {total_files} image(s) to process.")

    # Process pre-scanned files
    for root, filename in all_image_files:
        ext = os.path.splitext(filename)[1].lower()
        format_counts[ext] += 1
        input_path = os.path.join(root, filename)

        # Maintain folder hierarchy in output
        relative_path = os.path.relpath(root, input_folder)
        output_dir = os.path.join(output_folder, relative_path)
        os.makedirs(output_dir, exist_ok=True)

        output_filename = f"{os.path.splitext(filename)[0]}{out_ext}"
        output_path = os.path.join(output_dir, output_filename)

        if os.path.exists(output_path):
            skipped_count += 1
            skipped_copy_path = os.path.join(output_dir, filename)
            if not dry_run:
                shutil.copy2(input_path, skipped_copy_path)
            log_lines.append(
                f"Skipped & Copied Original: {input_path} → {skipped_copy_path}"
            )
            processed_count += 1
            if progress_callback:
                progress_callback(processed_count, total_files, filename)
            continue

        try:
            original_size = os.path.getsize(input_path)
            total_original_size += original_size

            with Image.open(input_path) as img:
                has_alpha = 'A' in img.getbands()
                if not dry_run:
                    save_kwargs = {}

                    if fmt == "webp":
                        if has_alpha:
                            img = img.convert("RGBA")
                            save_kwargs["lossless"] = use_lossless_for_pngs
                            save_kwargs["quality"] = png_quality if not use_lossless_for_pngs else 100
                        else:
                            img = img.convert("RGB")
                            save_kwargs["quality"] = jpg_quality if ext in ('.jpg', '.jpeg') else default_quality
                    elif fmt == "jpg":
                        img = img.convert("RGB")  # JPEG doesn't support alpha
                        save_kwargs["quality"] = jpg_quality if ext in ('.jpg', '.jpeg') else default_quality
                        save_kwargs["optimize"] = True
                    elif fmt == "png":
                        if has_alpha:
                            img = img.convert("RGBA")
                        else:
                            img = img.convert("RGB")
                        save_kwargs["optimize"] = True

                    img.save(output_path, pillow_fmt, **save_kwargs)

                    new_size = os.path.getsize(output_path)
                    total_converted_size += new_size
                else:
                    new_size = original_size

                converted_count += 1
                log_lines.append(
                    f"{'Would convert' if dry_run else 'Converted'}: "
                    f"{input_path} → {output_path} "
                    f"({round(original_size/1024)} KB → {round(new_size/1024)} KB)"
                )
        except Exception as e:
            log_lines.append(f"Failed to process {input_path}: {e}")

        processed_count += 1
        if progress_callback:
            progress_callback(processed_count, total_files, filename)

    # Count all images in output folder
    output_format_counts = {ext: 0 for ext in supported_extensions + ('.webp',)}
    output_image_total = 0
    for root, _, files in os.walk(output_folder):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in output_format_counts:
                output_format_counts[ext] += 1
                output_image_total += 1

    # Summary
    total_images_parsed = sum(format_counts.values())

    summary_lines = []
    summary_lines.append("Conversion Summary")
    for ext, count in format_counts.items():
        summary_lines.append(f"{ext.upper():<6}: {count} input image(s)")
    summary_lines.append(f"Total Images Parsed     : {total_images_parsed}")
    summary_lines.append(f"Total Converted          : {converted_count}")
    summary_lines.append(f"Total Skipped & Copied  : {skipped_count}")
    summary_lines.append(f"Total Original Size      : {round(total_original_size/1024, 2)} KB")

    size_diff = None
    reduction_percent = None
    if not dry_run:
        summary_lines.append(
            f"Total Compressed Size    : {round(total_converted_size/1024, 2)} KB"
        )
        size_diff = total_original_size - total_converted_size
        reduction_percent = (
            (size_diff / total_original_size) * 100 if total_original_size > 0 else 0
        )
        summary_lines.append(
            f"Space Saved              : {round(size_diff/1024, 2)} KB "
            f"({round(reduction_percent, 2)}%)"
        )

    summary_lines.append("Output Folder Summary")
    for ext, count in output_format_counts.items():
        summary_lines.append(f"{ext.upper():<6}: {count} image(s)")
    summary_lines.append(f"Total Output Images: {output_image_total}")
    if output_image_total >= total_images_parsed:
        summary_lines.append("Output folder contains all expected images.")
    else:
        summary_lines.append("Warning: Some images may be missing in the output folder.")

    log_lines.append("")  # spacing
    log_lines.extend(summary_lines)

    stats = {
        "format_counts": format_counts,
        "output_format_counts": output_format_counts,
        "total_images_parsed": total_images_parsed,
        "converted_count": converted_count,
        "skipped_count": skipped_count,
        "total_original_size": total_original_size,
        "total_converted_size": total_converted_size,
        "size_diff": size_diff,
        "reduction_percent": reduction_percent,
        "output_image_total": output_image_total,
        "log": "\n".join(log_lines),
        "summary": "\n".join(summary_lines),
    }

    return stats
