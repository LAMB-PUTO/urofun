import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../components/ui';
import { AdminPage } from '../features/admin/AdminPage';
import { LoginPage } from '../features/auth/LoginPage';
import { AgendaPage } from '../features/agenda/AgendaPage';
import { BookingPage } from '../features/booking/BookingPage';
import { ConsultationPage } from '../features/consultation/ConsultationPage';
import { CodeEntry } from '../features/kiosk/CodeEntry';
import { IntakeDone } from '../features/kiosk/IntakeDone';
import { IntakeWizard } from '../features/kiosk/IntakeWizard';
import { KioskHome } from '../features/kiosk/KioskHome';
import { ReturningLookup } from '../features/kiosk/ReturningLookup';
import { PatientsPage } from '../features/patients/PatientsPage';
import { PrintPage } from '../features/print/PrintPage';
import { RegisterPage } from '../features/registration/RegisterPage';
import { ResearchPage } from '../features/research/ResearchPage';
import { WaitingRoomPage } from '../features/waitingRoom/WaitingRoomPage';
import { RequireRole } from './guards/RequireRole';
import { KioskLayout } from './layouts/KioskLayout';
import { StaffLayout } from './layouts/StaffLayout';

const App = () => (
  <BrowserRouter>
    <ToastProvider>
      <Routes>
        <Route element={<KioskLayout />}>
          <Route path="/" element={<KioskHome />} />
          <Route path="/kiosk/nuevo" element={<IntakeWizard />} />
          <Route path="/kiosk/recurrente" element={<ReturningLookup />} />
          <Route path="/kiosk/recurrente/:prevVisitId" element={<IntakeWizard />} />
          <Route path="/kiosk/continuar/:visitId" element={<IntakeWizard />} />
          <Route path="/kiosk/codigo" element={<CodeEntry />} />
          <Route path="/kiosk/listo" element={<IntakeDone />} />
          <Route path="/schedule" element={<BookingPage />} />
          <Route path="/form" element={<Navigate to="/" replace />} />
        </Route>

        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/panel"
          element={
            <RequireRole>
              <StaffLayout />
            </RequireRole>
          }
        >
          <Route index element={<Navigate to="/panel/espera" replace />} />
          <Route path="espera" element={<WaitingRoomPage />} />
          <Route path="espera/:visitId" element={<WaitingRoomPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="registrar" element={<RegisterPage />} />
          <Route
            path="pacientes"
            element={
              <RequireRole roles={['doctor']}>
                <PatientsPage />
              </RequireRole>
            }
          />
          <Route
            path="pacientes/:patientKey"
            element={
              <RequireRole roles={['doctor']}>
                <PatientsPage />
              </RequireRole>
            }
          />
          <Route
            path="consulta/:visitId"
            element={
              <RequireRole roles={['doctor']}>
                <ConsultationPage />
              </RequireRole>
            }
          />
          <Route
            path="investigacion"
            element={
              <RequireRole roles={['doctor']}>
                <ResearchPage />
              </RequireRole>
            }
          />
          <Route
            path="doctores"
            element={
              <RequireRole admin>
                <AdminPage />
              </RequireRole>
            }
          />
        </Route>

        <Route
          path="/expediente/:visitId/print"
          element={
            <RequireRole roles={['doctor']}>
              <PrintPage />
            </RequireRole>
          }
        />

        <Route path="/dashboard" element={<Navigate to="/panel/espera" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  </BrowserRouter>
);

export default App;
