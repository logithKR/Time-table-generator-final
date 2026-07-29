from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from utils.database import get_db
from services.timetable_service import TimetableService, GenerateRequest

router = APIRouter()

def get_timetable_service(db: Session = Depends(get_db)):
    return TimetableService(db)

@router.post("/generate")
async def generate_timetable(req: GenerateRequest, service: TimetableService = Depends(get_timetable_service), db: Session = Depends(get_db)):
    from models import TimetableStatus
    from fastapi import HTTPException, status
    status_record = db.query(TimetableStatus).filter_by(department_code=req.department_code, semester=req.semester).first()
    if status_record and status_record.is_finalized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This timetable is finalized and cannot be modified.")
        
    import asyncio
    return await asyncio.to_thread(service.generate_and_save, req)

@router.get("/timetable")
def get_timetable(
    department_code: str = Query(...), 
    semester: int = Query(...), 
    service: TimetableService = Depends(get_timetable_service)
):
    return service.get_timetable(department_code, semester)
