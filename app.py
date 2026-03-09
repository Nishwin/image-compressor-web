# app.py
import os
import zipfile
import uuid
import threading
import time
import shutil
from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for, flash
from werkzeug.utils import secure_filename

from compressor import compress_folder

app = Flask(__name__)
app.secret_key = "change-this-secret"  # change for production
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024 * 1024  # 5 GB upload max (adjust)

UPLOAD_EXTENSIONS = {".zip"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

# Where job folders live (inside your project folder)
BASE_JOBS_DIR = os.path.join(os.getcwd(), "jobs")
os.makedirs(BASE_JOBS_DIR, exist_ok=True)

# Retention: files older than this (seconds) will be deleted by cleaner
RETENTION_SECONDS = 24 * 60 * 60  # 24 hours

# In-memory job store (for demo). For production use persistent store (Redis/DB).
jobs = {}
jobs_lock = threading.Lock()

def safe_rmtree(path):
    """Remove path, guard against accidental root deletion."""
    if not path:
        return
    path = os.path.abspath(path)
    # ensure we're deleting something under BASE_JOBS_DIR
    if not path.startswith(os.path.abspath(BASE_JOBS_DIR)):
        app.logger.warning("Refusing to delete path outside BASE_JOBS_DIR: %s", path)
        return
    if os.path.exists(path):
        shutil.rmtree(path, ignore_errors=True)

def make_progress_callback(job_id):
    """Create a progress callback that updates the job's progress fields."""
    def callback(current, total, filename):
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id]["progress"] = {
                    "current": current,
                    "total": total,
                    "filename": filename,
                }
    return callback

# Quality presets for compression strength
STRENGTH_PRESETS = {
    "light":  {"default_quality": 90, "jpg_quality": 85, "png_quality": 95},
    "medium": {"default_quality": 80, "jpg_quality": 70, "png_quality": 90},
    "heavy":  {"default_quality": 50, "jpg_quality": 40, "png_quality": 60},
}

def worker_process(job_id, input_zip_path, work_dir, output_format="webp", strength="medium", compression_type="lossy"):
    """
    Background worker: unzips, runs compression, zips output, updates jobs[job_id]
    """
    with jobs_lock:
        jobs[job_id]["status"] = "running"
        jobs[job_id]["log"] += "Worker started...\n"

    try:
        input_folder = os.path.join(work_dir, "input")
        os.makedirs(input_folder, exist_ok=True)

        # Unzip
        with zipfile.ZipFile(input_zip_path, "r") as zip_ref:
            zip_ref.extractall(input_folder)
        with jobs_lock:
            jobs[job_id]["log"] += "Unzipped input.\n"

        output_folder = os.path.join(work_dir, "output")

        preset = STRENGTH_PRESETS.get(strength, STRENGTH_PRESETS["medium"])
        use_lossless = compression_type == "lossless"

        # Run compression (this returns stats and a full log)
        stats = compress_folder(
            input_folder=input_folder,
            output_folder=output_folder,
            default_quality=preset["default_quality"],
            jpg_quality=preset["jpg_quality"],
            png_quality=preset["png_quality"],
            use_lossless_for_pngs=use_lossless,
            dry_run=False,
            output_format=output_format,
            progress_callback=make_progress_callback(job_id),
        )

        # Append compressor log
        with jobs_lock:
            jobs[job_id]["log"] += stats.get("log", "") + "\n"

        # Zip output
        output_zip_name = f"compressed_{uuid.uuid4().hex}.zip"
        output_zip_path = os.path.join(work_dir, output_zip_name)
        with zipfile.ZipFile(output_zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for root, _, files in os.walk(output_folder):
                for f in files:
                    file_path = os.path.join(root, f)
                    arcname = os.path.relpath(file_path, output_folder)
                    zipf.write(file_path, arcname=arcname)

        output_zip_size = os.path.getsize(output_zip_path)
        stats["output_zip_size"] = output_zip_size

        with jobs_lock:
            jobs[job_id]["status"] = "done"
            jobs[job_id]["log"] += f"Compression finished. Output zip: {output_zip_name} ({round(output_zip_size/1024/1024, 2)} MB)\n"
            jobs[job_id]["output_zip_path"] = output_zip_path
            jobs[job_id]["stats"] = stats
            jobs[job_id]["finished_at"] = time.time()

    except Exception as e:
        with jobs_lock:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["log"] += f"Error during processing: {e}\n"

def worker_process_folder(job_id, input_folder, work_dir, output_format="webp", strength="medium", compression_type="lossy"):
    """
    Background worker for folder uploads: files are already in input_folder,
    so skip unzip and go straight to compression.
    """
    with jobs_lock:
        jobs[job_id]["status"] = "running"
        jobs[job_id]["log"] += "Worker started...\n"

    try:
        output_folder = os.path.join(work_dir, "output")

        preset = STRENGTH_PRESETS.get(strength, STRENGTH_PRESETS["medium"])
        use_lossless = compression_type == "lossless"

        stats = compress_folder(
            input_folder=input_folder,
            output_folder=output_folder,
            default_quality=preset["default_quality"],
            jpg_quality=preset["jpg_quality"],
            png_quality=preset["png_quality"],
            use_lossless_for_pngs=use_lossless,
            dry_run=False,
            output_format=output_format,
            progress_callback=make_progress_callback(job_id),
        )

        with jobs_lock:
            jobs[job_id]["log"] += stats.get("log", "") + "\n"

        # Zip output
        output_zip_name = f"compressed_{uuid.uuid4().hex}.zip"
        output_zip_path = os.path.join(work_dir, output_zip_name)
        with zipfile.ZipFile(output_zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            for root, _, files in os.walk(output_folder):
                for f in files:
                    file_path = os.path.join(root, f)
                    arcname = os.path.relpath(file_path, output_folder)
                    zipf.write(file_path, arcname=arcname)

        output_zip_size = os.path.getsize(output_zip_path)
        stats["output_zip_size"] = output_zip_size

        with jobs_lock:
            jobs[job_id]["status"] = "done"
            jobs[job_id]["log"] += f"Compression finished. Output zip: {output_zip_name} ({round(output_zip_size/1024/1024, 2)} MB)\n"
            jobs[job_id]["output_zip_path"] = output_zip_path
            jobs[job_id]["stats"] = stats
            jobs[job_id]["finished_at"] = time.time()

    except Exception as e:
        with jobs_lock:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["log"] += f"Error during processing: {e}\n"

@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")

@app.route("/upload_async", methods=["POST"])
def upload_async():
    """
    Accepts a zip via XHR. Returns {"job_id": "..."} immediately and processes in background.
    """
    if "folder_zip" not in request.files:
        return jsonify({"error": "No file part in the request."}), 400

    file = request.files["folder_zip"]
    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    filename = secure_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in UPLOAD_EXTENSIONS:
        return jsonify({"error": "Please upload a .zip file containing your folder."}), 400

    # Create work dir inside project so you can inspect it in VS Code
    job_id = uuid.uuid4().hex
    work_dir = os.path.join(BASE_JOBS_DIR, f"imgcmp_{job_id}")
    os.makedirs(work_dir, exist_ok=True)

    input_zip_path = os.path.join(work_dir, filename)
    file.save(input_zip_path)

    output_format = request.form.get("output_format", "webp").lower().strip()
    strength = request.form.get("strength", "medium").lower().strip()
    compression_type = request.form.get("compression_type", "lossy").lower().strip()

    with jobs_lock:
        jobs[job_id] = {
            "id": job_id,
            "status": "pending",
            "work_dir": work_dir,
            "input_zip": input_zip_path,
            "output_zip_path": None,
            "log": f"Job created at {time.ctime()}\nJob folder: {work_dir}\nOutput format: {output_format} | Strength: {strength} | Type: {compression_type}\n",
            "stats": None,
            "progress": None,
            "created_at": time.time(),
            "finished_at": None,
        }

    # Start background thread
    t = threading.Thread(target=worker_process, args=(job_id, input_zip_path, work_dir, output_format, strength, compression_type), daemon=True)
    t.start()

    return jsonify({"job_id": job_id}), 202

@app.route("/upload_folder_async", methods=["POST"])
def upload_folder_async():
    """
    Accepts multiple image files from a folder upload (with webkitRelativePath).
    Reconstructs the folder structure, then compresses.
    """
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files uploaded."}), 400

    # Filter to supported image files
    image_files = []
    for f in files:
        ext = os.path.splitext(f.filename)[1].lower()
        if ext in IMAGE_EXTENSIONS:
            image_files.append(f)

    if not image_files:
        return jsonify({"error": "No supported image files found in the folder."}), 400

    job_id = uuid.uuid4().hex
    work_dir = os.path.join(BASE_JOBS_DIR, f"imgcmp_{job_id}")
    input_folder = os.path.join(work_dir, "input")
    os.makedirs(input_folder, exist_ok=True)

    # Save each file preserving its relative path
    for f in image_files:
        # f.filename contains the relative path (e.g. "photos/vacation/img.jpg")
        rel_path = f.filename
        # Sanitize each path component
        parts = rel_path.replace("\\", "/").split("/")
        safe_parts = [secure_filename(p) for p in parts if p]
        if not safe_parts:
            continue
        dest_path = os.path.join(input_folder, *safe_parts)
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        f.save(dest_path)

    output_format = request.form.get("output_format", "webp").lower().strip()
    strength = request.form.get("strength", "medium").lower().strip()
    compression_type = request.form.get("compression_type", "lossy").lower().strip()

    with jobs_lock:
        jobs[job_id] = {
            "id": job_id,
            "status": "pending",
            "work_dir": work_dir,
            "input_zip": None,
            "output_zip_path": None,
            "log": f"Job created at {time.ctime()}\nJob folder: {work_dir}\nUploaded {len(image_files)} image(s) from folder.\nOutput format: {output_format} | Strength: {strength} | Type: {compression_type}\n",
            "stats": None,
            "progress": None,
            "created_at": time.time(),
            "finished_at": None,
        }

    t = threading.Thread(target=worker_process_folder, args=(job_id, input_folder, work_dir, output_format, strength, compression_type), daemon=True)
    t.start()

    return jsonify({"job_id": job_id}), 202

@app.route("/status/<job_id>", methods=["GET"])
def status(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            return jsonify({"error": "job not found"}), 404
        resp = {
            "job_id": job_id,
            "status": job["status"],
            "stats_available": bool(job.get("stats")),
            "finished_at": job.get("finished_at"),
            "progress": job.get("progress"),
        }
        if job.get("stats"):
            s = job["stats"]
            resp["stats"] = {
                "total_original_size": s.get("total_original_size", 0),
                "total_converted_size": s.get("total_converted_size", 0),
                "size_diff": s.get("size_diff"),
                "reduction_percent": s.get("reduction_percent"),
                "total_images_parsed": s.get("total_images_parsed", 0),
                "converted_count": s.get("converted_count", 0),
                "output_zip_size": s.get("output_zip_size"),
            }
        return jsonify(resp)

@app.route("/log/<job_id>", methods=["GET"])
def log(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            return jsonify({"error": "job not found"}), 404
        return jsonify({
            "job_id": job_id,
            "log": job.get("log", "")
        })

@app.route("/download/<job_id>", methods=["GET"])
def download(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            flash("Download file not found or expired.")
            return redirect(url_for("index"))
        if job.get("status") != "done":
            flash("Job not ready yet.")
            return redirect(url_for("index"))
        output_zip_path = job.get("output_zip_path")
        if not output_zip_path or not os.path.exists(output_zip_path):
            flash("Download file not found.")
            return redirect(url_for("index"))
    return send_file(output_zip_path, as_attachment=True, download_name="compressed_images.zip")

def cleaner_loop():
    """
    Background cleaner that deletes job folders older than RETENTION_SECONDS.
    Runs hourly.
    """
    while True:
        try:
            now = time.time()
            to_delete = []
            with jobs_lock:
                # find jobs with finished_at older than retention
                for jid, job in list(jobs.items()):
                    finished_at = job.get("finished_at")
                    created_at = job.get("created_at", 0)
                    work_dir = job.get("work_dir")
                    # if finished and older than retention -> delete
                    if finished_at and (now - finished_at) > RETENTION_SECONDS:
                        to_delete.append((jid, work_dir))
                    # safety: remove very old pending/running jobs older than 2*retention
                    elif (now - created_at) > (2 * RETENTION_SECONDS):
                        to_delete.append((jid, work_dir))

            for jid, work_dir in to_delete:
                app.logger.info("Cleaner removing job %s -> %s", jid, work_dir)
                safe_rmtree(work_dir)
                with jobs_lock:
                    if jid in jobs:
                        del jobs[jid]
        except Exception as e:
            app.logger.exception("Cleaner loop error: %s", e)

        # Sleep one hour
        time.sleep(60 * 60)

# Start cleaner thread (daemon)
cleaner_thread = threading.Thread(target=cleaner_loop, daemon=True)
cleaner_thread.start()

if __name__ == "__main__":
    # Read port argument style support (so earlier suggestion to use -p still works)
    import sys
    port = 5000
    if "-p" in sys.argv:
        try:
            idx = sys.argv.index("-p")
            port = int(sys.argv[idx + 1])
        except Exception:
            pass
    app.run(host="0.0.0.0", port=port, debug=True)