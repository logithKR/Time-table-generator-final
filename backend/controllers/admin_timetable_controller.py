"""
Admin Timetable Controller — handles admin operations for timetables (finalize, delete, download).
Endpoints (prefixed with /api/admin/timetables):
  GET /                  — list all timetables
  POST /{dept}/{sem}/finalize — finalize a timetable
  POST /{dept}/{sem}/unfinalize — unfinalize a timetable
  DELETE /{dept}/{sem}   — delete a timetable
  DELETE /all            — delete all timetables
  GET /download-all      — download all timetables as ZIP
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import distinct, func
from typing import Any, Dict, List
import io
import zipfile
import json
from datetime import datetime
import pandas as pd

from middleware.admin_guard import verify_admin_token
from utils.database import get_db
from models import TimetableEntry, TimetableStatus, DepartmentMaster

router = APIRouter(prefix="/timetables", tags=["Admin Timetable Management"])

@router.get("/", dependencies=[Depends(verify_admin_token)])
def list_timetables(db: Session = Depends(get_db)):
    # Get all distinct dept/sem from entries
    entries = db.query(TimetableEntry.department_code, TimetableEntry.semester).distinct().all()
    
    # Get all statuses
    statuses = db.query(TimetableStatus).all()
    status_map = {(s.department_code, s.semester): s for s in statuses}
    
    result = []
    for dept, sem in entries:
        status_record = status_map.get((dept, sem))
        result.append({
            "department_code": dept,
            "semester": sem,
            "is_finalized": status_record.is_finalized if status_record else False,
            "finalized_by": status_record.finalized_by if status_record else None,
            "finalized_at": status_record.finalized_at if status_record else None
        })
        
    return {"data": result}

@router.post("/{dept}/{sem}/finalize", dependencies=[Depends(verify_admin_token)])
def finalize_timetable(dept: str, sem: int, admin_email: str = Depends(verify_admin_token), db: Session = Depends(get_db)):
    status_record = db.query(TimetableStatus).filter_by(department_code=dept, semester=sem).first()
    if not status_record:
        status_record = TimetableStatus(department_code=dept, semester=sem)
        db.add(status_record)
    
    status_record.is_finalized = True
    status_record.finalized_by = admin_email
    from datetime import datetime
    import pytz
    ist = pytz.timezone('Asia/Kolkata')
    status_record.finalized_at = datetime.now(ist).strftime('%Y-%m-%d %H:%M:%S')
    
    db.commit()
    return {"message": "Timetable finalized successfully"}

@router.post("/{dept}/{sem}/unfinalize", dependencies=[Depends(verify_admin_token)])
def unfinalize_timetable(dept: str, sem: int, db: Session = Depends(get_db)):
    status_record = db.query(TimetableStatus).filter_by(department_code=dept, semester=sem).first()
    if status_record:
        status_record.is_finalized = False
        status_record.finalized_by = None
        status_record.finalized_at = None
        db.commit()
    return {"message": "Timetable unfinalized successfully"}

@router.delete("/{dept}/{sem}", dependencies=[Depends(verify_admin_token)])
def delete_timetable(dept: str, sem: int, db: Session = Depends(get_db)):
    status_record = db.query(TimetableStatus).filter_by(department_code=dept, semester=sem).first()
    if status_record and status_record.is_finalized:
        raise HTTPException(status_code=400, detail="Cannot delete a finalized timetable. Unfinalize it first.")
        
    db.query(TimetableEntry).filter_by(department_code=dept, semester=sem).delete()
    db.commit()
    return {"message": "Timetable deleted successfully"}

@router.delete("/all", dependencies=[Depends(verify_admin_token)])
def delete_all_timetables(db: Session = Depends(get_db)):
    finalized = db.query(TimetableStatus).filter_by(is_finalized=True).first()
    if finalized:
        raise HTTPException(status_code=400, detail="Cannot delete all because some timetables are finalized. Unfinalize them first.")
        
    db.query(TimetableEntry).delete()
    db.commit()
    return {"message": "All timetables deleted successfully"}

@router.get("/download-all", dependencies=[Depends(verify_admin_token)])
def download_all_timetables(db: Session = Depends(get_db)):
    # Generate an Excel file for each timetable and zip them
    entries = db.query(TimetableEntry.department_code, TimetableEntry.semester).distinct().all()
    
    if not entries:
        raise HTTPException(status_code=404, detail="No timetables found to download")
        
    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for dept, sem in entries:
            # Query the data just to check existence, but generate_timetable_excel_bytes handles the rest
            tt_data = db.query(TimetableEntry).filter_by(department_code=dept, semester=sem).first()
            if not tt_data: continue
            
            try:
                from utils.excel_export import generate_timetable_excel_bytes
                excel_bytes = generate_timetable_excel_bytes(dept, sem, db)
                zf.writestr(f"Timetable_{dept}_Sem{sem}.xlsx", excel_bytes.read())
            except Exception as e:
                print(f"Error generating excel for {dept} {sem}: {e}")
                continue
            
    memory_file.seek(0)
    return StreamingResponse(
        memory_file, 
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=All_Timetables_{datetime.now().strftime('%Y%m%d')}.zip"}
    )
