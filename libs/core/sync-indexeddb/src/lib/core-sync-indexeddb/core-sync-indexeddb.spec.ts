import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CoreSyncIndexeddb } from './core-sync-indexeddb';

describe('CoreSyncIndexeddb', () => {
  let component: CoreSyncIndexeddb;
  let fixture: ComponentFixture<CoreSyncIndexeddb>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoreSyncIndexeddb]
    }).compileComponents();

    fixture = TestBed.createComponent(CoreSyncIndexeddb);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
